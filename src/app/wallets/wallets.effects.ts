import { Injectable, NgZone } from '@angular/core';
import { Effect, Actions, ofType } from '@ngrx/effects';
import { HttpClient } from '@angular/common/http';
import { Store } from '@ngrx/store';
import { map, withLatestFrom, flatMap, switchMap, catchError, filter, tap, takeLast, first, delay } from 'rxjs/operators';
import { Router } from '@angular/router';
import { of, Observable } from 'rxjs';
import { initializeWallet, getWallet, transaction, confirmOperation } from 'tezos-wallet';
import { environment } from 'src/environments/environment';

@Injectable()
export class WalletsEffects {

    @Effect()
    WalletsListInit$ = this.actions$.pipe(
        ofType('WALLETS_LIST_INIT'),
        map(() => {
            // get wallets from localstorage
            const localstorageWallets = JSON.parse(localStorage.getItem('SANDBOX-WALLETS'))
            return localstorageWallets ? localstorageWallets : [];
        }),
        // get current url + hydrate wallets from localstorage
        switchMap(payload => [
            { type: 'HYDRATE_LOCALSTORAGE_WALLETS', payload: payload },
            { type: 'WALLET_LIST_LOAD', payload: payload },
        ])
    );

    // get wallets 
    @Effect()
    WalletsListLoad$ = this.actions$.pipe(
        ofType('WALLET_LIST_LOAD'),

        // get state from store
        withLatestFrom(this.store, (action, state: any) => state),

        flatMap((state: any) => state.wallets.initWallets
            // TODO: temp comment to see changes fast
            // .filter(id =>
            //     // get balance only if last download is older than 3 mins
            //     (new Date().getTime() - state.tezos.tezosWalletList.entities[id].timestamp) < (5 * 60 * 1000) ? false : true
            // )
            .map(initWallet => ({
                // TODO
                node: {
                    display: 'Sandbox',
                    name: 'sandbox',
                    url: 'http://sandbox.dev.tezedge.com:18732', 
                    // url: state.settingsNode.api.http, 
                    tzstats: {
                        url: 'https://tzstats.com/',
                        api: 'https://api.tzstats.com/',
                    },
                },
                detail: initWallet
            }))
        ),

        // wait for animation to finish
        delay(500),
    
        flatMap((state: any) => of([]).pipe(
            // initialize 
            initializeWallet(stateWallet => ({
                publicKeyHash: state.detail.publicKeyHash,
                node: state.node
            })),

            // get wallet info
            getWallet(),

            // enter back into zone.js so change detection works
            enterZone(this.zone),
        )),

        map(action => ({ type: 'WALLET_LIST_LOAD_SUCCESS', payload: action })),

        catchError((error, caught) => {
            console.error(error.message)
            this.store.dispatch({
                type: 'WALLET_LIST_LOAD_ERROR',
                payload: error.message,
            });
            return caught;
        }),

    )

    @Effect()
    TezosOperationTransaction$ = this.actions$.pipe(
        ofType('WALLET_TRANSACTION'),

        // add state to effect
        withLatestFrom(this.store, (action: any, state) => ({ action, state })),

        flatMap(({ action, state }) => of([]).pipe(

            // wait until sodium is ready
            initializeWallet(stateWallet => ({
                secretKey: state.wallets.selectedWallet.secretKey,
                publicKey: state.wallets.selectedWallet.publicKey,
                // for smart contract use manager address
                publicKeyHash: state.wallets.selectedWallet.publicKeyHash,
                // set tezos node
                node: {
                    display: 'Sandbox',
                    name: 'sandbox',
                    url: 'http://sandbox.dev.tezedge.com:18732', 
                    // url: state.settingsNode.api.http, 
                    tzstats: {
                        url: 'https://tzstats.com/',
                        api: 'https://api.tzstats.com/',
                    },
                },
                // set wallet type: WEB, TREZOR_ONE, TREZOR_T
                type: "web",
                // set HD path for HW wallet
                path: undefined
            })),

            // send xtz 
            transaction(stateWallet => ({
                to: state.wallets.form.to,
                amount: state.wallets.form.amount,
                fee: state.wallets.form.fee,
            })),

            // enter back into zone.js so change detection works
            enterZone(this.zone),

        )),

        // dispatch action based on result
        map((data: any) => ({
            type: 'WALLET_TRANSACTION_SUCCESS',
            payload: { injectionOperation: data.injectionOperation }
        })),
        catchError((error, caught) => {
            console.error(error)
            this.store.dispatch({
                type: 'WALLET_TRANSACTION_ERROR',
                payload: error.response,
            });
            return caught;
        }),

    )

    // check mempool for operation
    @Effect()
    TezosOperationTransactionPending$ = this.actions$.pipe(
        ofType('WALLET_TRANSACTION_SUCCESS'),

        // add state to effect
        withLatestFrom(this.store, (action: any, state: any) => ({ action, state })),

        flatMap(({ action, state }) => of([]).pipe(

            // wait until sodium is ready
            initializeWallet(stateWallet => <any>({
                // set tezos node
                node: {
                    display: 'Sandbox',
                    name: 'sandbox',
                    url: 'http://sandbox.dev.tezedge.com:18732', 
                    // url: state.settingsNode.api.http, 
                    tzstats: {
                        url: 'https://tzstats.com/',
                        api: 'https://api.tzstats.com/',
                    },
                },
            })),

            // wait until operation is confirmed & moved from mempool to head
            confirmOperation(stateWallet => ({
                injectionOperation: action.payload.injectionOperation,
            })),

            // enter back into zone.js so change detection works
            enterZone(this.zone),

            map(() => ({ action, state }))
        )),

        map(({ action, state }) => ({
            type: 'WALLET_TRANSACTION_PENDING_SUCCESS',
            payload: {
                wallet: {
                    publicKeyHash: state.wallets.selectedWallet.publicKeyHash
                },
            },
        })),

        catchError((error, caught) => {
            console.error(error)
            this.store.dispatch({
                type: 'WALLET_TRANSACTION_PENDING_ERROR',
                payload: error,
            });
            return caught;
        }),
    )

    constructor(
        private http: HttpClient,
        private actions$: Actions,
        private store: Store<any>,
        private router: Router,
        private zone: NgZone
    ) { }

}

export function enterZone(zone) {
    return function enterZoneImplementation(source) {
      return Observable.create(observer => {
        const onNext = (value) => zone.run(() => observer.next(value));
        const onError = (e) => zone.run(() => observer.error(e));
        const onComplete = () => zone.run(() => observer.complete());
        return source.subscribe(onNext, onError, onComplete);
      });
    };
  }