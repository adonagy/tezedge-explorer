import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs/operators';
import { Resource } from '../types/resource';
import { CpuResource } from '../types/cpu-resources';
import { DiskResource } from '../types/disk-resource';
import { MemoryResource, MemoryResourceUsage } from '../types/memory-resource';

@Injectable({
  providedIn: 'root'
})
export class ResourcesService {

  constructor(private http: HttpClient) {}

  getResources(endpoint: string): Observable<Resource[]> {
    return this.http.get<Resource[]>(endpoint)
      .pipe(map(response => ResourcesService.mapGetResourcesResponse(response)));
  }

  private static mapGetResourcesResponse(response: any): Resource[] {
    const twoDigitValue = (value: number) => value < 10 ? ('0' + value) : value;

    return response.map(responseItem => {
      const date = new Date(responseItem.timestamp * 1000);
      const resource = new Resource();
      resource.timestamp = twoDigitValue(date.getHours()) + ':' + twoDigitValue(date.getMinutes());

      resource.memory = new MemoryResource();
      resource.memory.node = new MemoryResourceUsage();
      resource.memory.node.resident = responseItem.memory.node.resident_mem;
      resource.memory.node.virtual = responseItem.memory.node.virtual_mem;
      resource.memory.total = resource.memory.node.resident;

      if (responseItem.memory.protocol_runners) {
        resource.memory.protocolRunners = new MemoryResourceUsage();
        resource.memory.protocolRunners.resident = responseItem.memory.protocol_runners.resident_mem;
        resource.memory.protocolRunners.virtual = responseItem.memory.protocol_runners.virtual_mem;
        resource.memory.total += resource.memory.protocolRunners.resident;
      }

      if (responseItem.memory.validators) {
        resource.memory.validators = new MemoryResourceUsage();
        resource.memory.validators.resident = responseItem.memory.validators.resident_mem;
        resource.memory.validators.virtual = responseItem.memory.validators.virtual_mem;
        resource.memory.total += resource.memory.validators.resident;
      }

      resource.cpu = new CpuResource();
      resource.cpu.node = responseItem.cpu.node;
      resource.cpu.protocolRunners = responseItem.cpu.protocol_runners || undefined;

      resource.disk = new DiskResource();
      resource.disk.blockStorage = responseItem.disk.block_storage;
      resource.disk.debugger = responseItem.disk.debugger;
      resource.disk.contextIrmin = responseItem.disk.context_irmin;
      resource.disk.mainDb = responseItem.disk.main_db || undefined;
      resource.disk.contextActions = responseItem.disk.context_actions || undefined;
      resource.disk.contextMerkleRocksDb = responseItem.disk.context_merkle_rocksdb || undefined;

      return resource;
    });
  }
}
