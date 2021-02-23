import { ChangeDetectionStrategy, Component, OnDestroy, OnInit } from '@angular/core';
import { curveCardinal } from 'd3-shape';
import { select, Store } from '@ngrx/store';
import { Resource } from '../../types/resource';
import { Observable } from 'rxjs';
import { ResourcesActionTypes } from '../../state/resources.actions';
import { filter, map } from 'rxjs/operators';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { BreakpointObserver } from '@angular/cdk/layout';


class ChartData {
  cpu: Array<{
    name: string;
    series: Array<SeriesEntry>;
  }>;
  memory: Array<{
    name: string;
    series: Array<SeriesEntry>;
  }>;
  disk: Array<{
    name: string;
    series: Array<SeriesEntry>;
  }>;
  xTicksValues: string[];
}

class SeriesEntry {
  name: string;
  value: number;
}

class ResourcesAdditionalInfo {
  cpu: ResourcesAdditionalInfoBlock[] = [];
  memory: ResourcesAdditionalInfoBlock[] = [];
  disk: ResourcesAdditionalInfoBlock[] = [];
}

export class ResourcesAdditionalInfoBlock {
  name: string;
  value: number;
  color: string;
  label: string;

  constructor(name: string, value: number, color: string, label: string) {
    this.name = name;
    this.value = value;
    this.color = color;
    this.label = label;
  }
}

@UntilDestroy()
@Component({
  selector: 'app-resources',
  templateUrl: './resources.component.html',
  styleUrls: ['./resources.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ResourcesComponent implements OnInit, OnDestroy {

  chartData$: Observable<ChartData>;

  readonly curve = curveCardinal;
  readonly colorScheme = {
    domain: ['#46afe3', '#df80ff', '#5aa454', '#ff8c00', '#ffe600', '#ff1c91']
  };
  readonly yAxisPercentageConversion = (value) => `${value}%`;
  readonly yAxisGigaBytesConversion = (value) => {
    value = value / 1000000000;
    return (value < 1 ? value : (value + '.00')) + ' GB';
  };

  lastMeasurement: string;
  additionalInfo: ResourcesAdditionalInfo;
  activeAdditionalInfo: 'cpu' | 'memory' | 'disk' = 'disk';

  private isSmallDevice: boolean;

  constructor(private store: Store<any>,
              private breakpointObserver: BreakpointObserver) {}

  ngOnInit(): void {
    this.handleSmallDevices();
    this.chartData$ = this.store.pipe(
      untilDestroyed(this),
      select(state => state.resources.resources),
      filter((resources: Resource[]) => resources.length > 0),
      map((resources: Resource[]) => this.createChartData(resources))
    );
    this.getResources();
  }

  toggleAdditionalInfo(value: 'cpu' | 'memory' | 'disk'): void {
    this.activeAdditionalInfo = value;
  }

  private handleSmallDevices(): void {
    this.isSmallDevice = window.innerWidth < 1100;
    this.breakpointObserver.observe('(min-width: 1100px)')
      .pipe(untilDestroyed(this))
      .subscribe(() => {
        this.isSmallDevice = window.innerWidth < 1100;
        this.getResources();
      });
  }

  private getResources(): void {
    this.store.dispatch({ type: ResourcesActionTypes.LoadResources });
  }

  private createChartData(resources: Array<Resource>): ChartData {
    resources = [...new Map(resources.map(entry => [entry.timestamp, entry])).values()].reverse(); // create a unique time based list of entries

    this.lastMeasurement = resources[0].timestamp;
    this.additionalInfo = this.createAdditionalInfoData(resources);

    const chartData = new ChartData();
    chartData.memory = [];
    chartData.disk = [];
    chartData.cpu = [];

    chartData.memory.push({
      name: 'NODES',
      series: ResourcesComponent.getSeries(resources, 'memory.node.resident')
    });
    if (resources[0].memory.protocolRunners) {
      chartData.memory.push({
        name: 'PROTOCOL RUNNERS',
        series: ResourcesComponent.getSeries(resources, 'memory.protocolRunners.resident')
      });
    }
    if (resources[0].memory.validators) {
      chartData.memory.push({
        name: 'VALIDATORS',
        series: ResourcesComponent.getSeries(resources, 'memory.validators.resident')
      });
    }
    chartData.memory.push({
      name: 'TOTAL',
      series: ResourcesComponent.getSeries(resources, 'memory.total')
    });

    chartData.cpu.push({
      name: 'CPU',
      series: ResourcesComponent.getSeries(resources, 'cpu.node')
    });

    chartData.disk.push({
      name: 'BLOCK STORAGE',
      series: ResourcesComponent.getSeries(resources, 'disk.blockStorage')
    });
    chartData.disk.push({
      name: 'DEBUGGER',
      series: ResourcesComponent.getSeries(resources, 'disk.debugger')
    });
    chartData.disk.push({
      name: 'CONTEXT IRMIN',
      series: ResourcesComponent.getSeries(resources, 'disk.contextIrmin')
    });

    if (resources[0].disk.mainDb) {
      chartData.disk.push({
        name: 'MAIN DB',
        series: ResourcesComponent.getSeries(resources, 'disk.mainDb')
      });
    }
    if (resources[0].disk.contextMerkleRocksDb) {
      chartData.disk.push({
        name: 'CONTEXT MERKLE ROCKS DB',
        series: ResourcesComponent.getSeries(resources, 'disk.contextMerkleRocksDb')
      });
    }
    if (resources[0].disk.contextActions) {
      chartData.disk.push({
        name: 'CONTEXT ACTIONS',
        series: ResourcesComponent.getSeries(resources, 'disk.contextActions')
      });
    }
    chartData.xTicksValues = ResourcesComponent.getFilteredXTicks(resources, Math.min(resources.length, this.isSmallDevice ? 5 : 15));

    return chartData;
  }

  private static getSeries(resources: Array<Resource>, pathToProperty: string): Array<SeriesEntry> {
    return resources.map(resource => ({
      name: resource.timestamp,
      value: ResourcesComponent.getValueFromNestedResourceProperty(resource, pathToProperty)
    }));
  }

  private static getValueFromNestedResourceProperty(resource: Resource, pathToProperty: string): number {
    return pathToProperty.split('.').reduce((obj: Resource, property: string) => obj[property], resource);
  }

  private static getFilteredXTicks(resources: Resource[], noOfResults: number): string[] {
    const xTicks = [];
    const delta = Math.floor(resources.length / noOfResults);

    for (let i = 0; i < resources.length; i = i + delta) {
      xTicks.push(resources[i].timestamp);
    }
    return xTicks;
  }

  ngOnDestroy(): void {
    this.store.dispatch({ type: ResourcesActionTypes.ResourcesClose });
  }

  private createAdditionalInfoData(resources: Array<Resource>): ResourcesAdditionalInfo {
    const info = new ResourcesAdditionalInfo();
    const lastResource = resources[resources.length - 1];
    info.cpu.push(new ResourcesAdditionalInfoBlock('Load', lastResource.cpu.node, this.colorScheme.domain[0], '%'));

    info.memory.push(new ResourcesAdditionalInfoBlock('Nodes', lastResource.memory.node.resident / 1000000000, this.colorScheme.domain[0], 'GB'));
    if (lastResource.memory.protocolRunners) {
      info.memory.push(new ResourcesAdditionalInfoBlock(
        'Protocol runners',
        lastResource.memory.protocolRunners.resident / 1000000000,
        this.colorScheme.domain[1],
        'GB'
      ));
    }
    if (lastResource.memory.validators) {
      info.memory.push(new ResourcesAdditionalInfoBlock(
        'Validators',
        lastResource.memory.validators.resident / 1000000000,
        this.colorScheme.domain[1],
        'GB'
      ));
    }
    info.memory.push(new ResourcesAdditionalInfoBlock('Total', lastResource.memory.total / 1000000000, this.colorScheme.domain[2], 'GB'));

    info.disk.push(new ResourcesAdditionalInfoBlock(
      'Block storage',
      lastResource.disk.blockStorage / 1000000000,
      this.colorScheme.domain[0],
      'GB'
    ));
    if (lastResource.disk.contextMerkleRocksDb) {
      info.disk.push(new ResourcesAdditionalInfoBlock(
        'Context Merkle Rocks DB',
        lastResource.disk.contextMerkleRocksDb / 1000000000,
        this.colorScheme.domain[4],
        'GB'
      ));
    }
    if (lastResource.disk.contextActions) {
      info.disk.push(
        new ResourcesAdditionalInfoBlock(
          'Context Actions',
          lastResource.disk.contextActions / 1000000000,
          this.colorScheme.domain[5],
          'GB'
        ));
    }
    info.disk.push(new ResourcesAdditionalInfoBlock('Debugger', lastResource.disk.debugger / 1000000000, this.colorScheme.domain[1], 'GB'));
    info.disk.push(new ResourcesAdditionalInfoBlock('Context Irmin', lastResource.disk.contextIrmin / 1000000000, this.colorScheme.domain[2], 'GB'));
    if (lastResource.disk.mainDb) {
      info.disk.push(new ResourcesAdditionalInfoBlock('Main DB', lastResource.disk.mainDb / 100000000, this.colorScheme.domain[3], 'GB'));
    }

    return info;
  }
}
