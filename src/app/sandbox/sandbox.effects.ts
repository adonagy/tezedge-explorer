import { Injectable } from '@angular/core';
import { Effect, Actions, ofType } from '@ngrx/effects';
import { HttpClient } from '@angular/common/http';
import { Store } from '@ngrx/store';
import { map, switchMap, flatMap, takeUntil, withLatestFrom, catchError, tap } from 'rxjs/operators';
import { of, interval, Subject, empty } from 'rxjs';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';

const sandboxStopPending$ = new Subject();

@Injectable()
export class SandboxEffects {

    @Effect()
    SandboxNodeStart$ = this.actions$.pipe(
        ofType('CHAIN_SERVER_FORM_SUBMIT'),

        // merge state
        withLatestFrom(this.store, (action: any, state) => ({ action, state })),

        switchMap(({ action, state }) => {
            console.log('[CHAIN_SERVER_FORM_SUBMIT]', state.settingsNode);
            return this.http.post(state.settingsNode.sandbox + '/start', state.sandbox.endpoints.start);
        }),

        // dispatch actions
        switchMap(payload => [
            { type: 'CHAIN_SERVER_FORM_SUBMIT_SUCCESS', payload: payload },
            { type: 'SANDBOX_NODE_START_SUCCESS', payload: payload },
        ]),
        catchError((error, caught) => {
            console.error(error)
            this.store.dispatch({
                type: 'CHAIN_SERVER_FORM_SUBMIT_ERROR',
                payload: error,
            });
            return caught;
        })
    );


    @Effect()
    SandboxNodeStop$ = this.actions$.pipe(
        ofType('SANDBOX_NODE_STOP'),

        // merge state
        withLatestFrom(this.store, (action: any, state) => ({ action, state })),

        switchMap(({ action, state }) => {
            console.log('[SANDBOX_NODE_STOP]', state.settingsNode);
            return this.http.get(state.settingsNode.sandbox + '/stop');
        }),

        // dispatch actions
        map((payload) => ({ type: 'SANDBOX_NODE_STOP_PENDING', payload: payload })),
        catchError((error, caught) => {
            console.error(error);
            this.store.dispatch({
                type: 'SANDBOX_NODE_STOP_ERROR',
                payload: error,
            });
            return caught;
        })
    );


    @Effect({dispatch: false})
    SandboxNodeStopPending$ = this.actions$.pipe(
        ofType('SANDBOX_NODE_STOP_PENDING'),

        // merge state
        withLatestFrom(this.store, (action: any, state) => ({ action, state })),

        switchMap(({ action, state }) =>

            // get header data every second
            interval(1000).pipe(
                takeUntil(sandboxStopPending$),
                switchMap(() => {
                    console.log('[SANDBOX_NODE_STOP_PENDING]', state.settingsNode.api.http + '/chains/main/blocks/head/header');

                    return this.http.get(state.settingsNode.api.http + '/chains/main/blocks/head/header').pipe(
                        catchError((error, caught) => {
                            console.warn('[SANDBOX_NODE_STOP_PENDING] error ', error);

                            sandboxStopPending$.next();
                            this.store.dispatch({
                                type: 'SANDBOX_NODE_STOP_SUCCESS',
                                payload: error,
                            });
                            return empty();
                        }),
                    );

                })
            )
        )
    );


    // reset application applications
    @Effect()
    SandboxNodeStopSuccess$ = this.actions$.pipe(
        ofType('SANDBOX_NODE_STOP_SUCCESS'),

        // merge state
        withLatestFrom(this.store, (action: any, state) => ({ action, state })),

        switchMap(({ action, state }) => {
            console.log('[SANDBOX_NODE_STOP_SUCCESS]', state.settingsNode);

            // dispatch APP_INIT_DEFAULT if we have only sandbox node
            return (state.settingsNode.entities.hasOwnProperty('sandbox-carthage-tezedge') && state.settingsNode.ids.length === 1) ?
                of({ type: 'APP_INIT_DEFAULT', payload: '' }) : of({ type: 'SETTINGS_NODE_LOAD', payload: '' });
        }),

        catchError((error, caught) => {
            console.error(error);
            this.store.dispatch({
                type: 'SANDBOX_NODE_STOP_SUCCESS_ERROR',
                payload: error,
            });
            return caught;
        })
    );



    @Effect()
    SandboxWalletInit$ = this.actions$.pipe(
        ofType('CHAIN_WALLETS_SUBMIT'),

        // merge state
        withLatestFrom(this.store, (action: any, state) => ({ action, state })),

        switchMap(({ action, state }) => {
            console.log('[CHAIN_WALLETS_SUBMIT]', state.settingsNode);
            return this.http.post(state.settingsNode.sandbox + '/init_client', state.sandbox.endpoints.initClient)
        }),

        // dispatch actions
        switchMap(payload => [
            { type: 'CHAIN_WALLETS_SUBMIT_SUCCESS', payload: payload },
            { type: 'SANDBOX_INIT_CLIENT_SUCCESS', payload: payload },
        ]),
        catchError((error, caught) => {
            console.error(error);
            this.store.dispatch({
                type: 'CHAIN_WALLETS_SUBMIT_ERROR',
                payload: error,
            });
            return caught;
        })
    );

    @Effect({ dispatch: false })
    SandboxWalletSubmitSuccess$ = this.actions$.pipe(
        ofType('CHAIN_WALLETS_SUBMIT_SUCCESS'),

        // merge state
        withLatestFrom(this.store, (action: any, state) => ({ action, state })),

        // persist wallets in localstorage
        // tap(({ action, state }) => {
        //     localStorage.setItem('SANDBOX-WALLETS', JSON.stringify(state.chainWallets.wallets))
        // })
    );

    @Effect()
    SandboxActivateProtocol$ = this.actions$.pipe(
        ofType('CHAIN_CONFIG_FORM_SUBMIT'),

        // merge state
        withLatestFrom(this.store, (action: any, state) => ({ action, state })),

        switchMap(({ action, state }) => {
            console.log('[CHAIN_CONFIG_FORM_SUBMIT]', state.settingsNode);
            return this.http.post(state.settingsNode.sandbox + '/activate_protocol', state.sandbox.endpoints.activateProtocol)
        }),

        // dispatch actions
        switchMap(payload => [
            { type: 'CHAIN_CONFIG_FORM_SUBMIT_SUCCESS', payload: payload },
            { type: 'SANDBOX_ACTIVATE_PROTOCOL_SUCCESS', payload: payload },
            { type: 'SIDENAV_VISIBILITY_CHANGE', payload: true },
            { type: 'TOOLBAR_VISIBILITY_CHANGE', payload: true },
            { type: 'SETTINGS_NODE_LOAD_SANDBOX', payload: '' },
        ]),
        catchError((error, caught) => {
            console.error(error)
            this.store.dispatch({
                type: 'CHAIN_CONFIG_FORM_SUBMIT_ERROR',
                payload: error,
            });
            return caught;
        }),
        tap(() => this.router.navigate(['chain'])),
    );

    @Effect()
    SandboxBakeBLock$ = this.actions$.pipe(
        ofType('SANDBOX_BAKE_BLOCK'),

        // merge state
        withLatestFrom(this.store, (action: any, state) => ({ action, state })),

        switchMap(({ action, state }) => {
            console.log('[SANDBOX_BAKE_BLOCK]', state.settingsNode);
            return this.http.get(state.settingsNode.sandbox + '/bake')
        }),

        // dispatch action
        switchMap((payload) => [
            { type: 'MEMPOOL_ACTION_LOAD' },
            { type: 'STORAGE_BLOCK_LOAD' },
            { type: 'WALLETS_LIST_INIT' },
            { type: 'SANDBOX_BAKE_BLOCK_SUCCESS', payload: payload },
        ]),
        catchError((error, caught) => {
            console.error(error)
            this.store.dispatch({
                type: 'SANDBOX_BAKE_BLOCK_ERROR',
                payload: error,
            });
            this.snackBar.open('Baking failed', 'DISMISS', {
                verticalPosition: 'bottom',
                horizontalPosition: 'right',
                panelClass: 'snackbar-error'
            });
            return caught;
        }),
        // show success notification
        tap((action) => {
            this.snackBar.open('Successfully baked', 'DISMISS', {
                duration: 5000,
                verticalPosition: 'bottom',
                horizontalPosition: 'right'
            });
        }),
    );


    constructor(
        private http: HttpClient,
        private actions$: Actions,
        private store: Store<any>,
        private router: Router,
        private snackBar: MatSnackBar,
    ) { }

}