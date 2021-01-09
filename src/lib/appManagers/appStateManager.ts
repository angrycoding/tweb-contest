import type { Dialog } from './appMessagesManager';
import type { AppStickersManager } from './appStickersManager';
import { App, MOUNT_CLASS_TO, UserAuth } from '../mtproto/mtproto_config';
import EventListenerBase from '../../helpers/eventListenerBase';
import rootScope from '../rootScope';
import AppStorage from '../storage';
import { logger } from '../logger';
import type { AppUsersManager } from './appUsersManager';
import type { AppChatsManager } from './appChatsManager';
import type { AuthState } from '../../types';
import type FiltersStorage from '../storages/filters';
import type DialogsStorage from '../storages/dialogs';
import { copy, setDeepProperty, isObject, validateInitObject } from '../../helpers/object';
import { AppDraftsManager } from './appDraftsManager';

const REFRESH_EVERY = 24 * 60 * 60 * 1000; // 1 day
const STATE_VERSION = App.version;

export type State = Partial<{
  dialogs: Dialog[],
  allDialogsLoaded: DialogsStorage['allDialogsLoaded'],
  chats: {[peerId: string]: ReturnType<AppChatsManager['getChat']>},
  users: {[peerId: string]: ReturnType<AppUsersManager['getUser']>},
  messages: any[],
  contactsList: number[],
  updates: Partial<{
    seq: number,
    pts: number,
    date: number
  }>,
  filters: FiltersStorage['filters'],
  maxSeenMsgId: number,
  stateCreatedTime: number,
  recentEmoji: string[],
  topPeers: number[],
  recentSearch: number[],
  stickerSets: AppStickersManager['stickerSets'],
  version: typeof STATE_VERSION,
  authState: AuthState,
  hiddenPinnedMessages: {[peerId: string]: number},
  settings: {
    messagesTextSize: number,
    sendShortcut: 'enter' | 'ctrlEnter',
    animationsEnabled: boolean,
    autoDownload: {
      contacts: boolean
      private: boolean
      groups: boolean
      channels: boolean
    },
    autoPlay: {
      gifs: boolean,
      videos: boolean
    },
    stickers: {
      suggest: boolean,
      loop: boolean
    }
  },
  drafts: AppDraftsManager['drafts']
}>;

const STATE_INIT: State = {
  dialogs: [],
  allDialogsLoaded: {},
  chats: {},
  users: {},
  messages: [],
  contactsList: [],
  updates: {},
  filters: {},
  maxSeenMsgId: 0,
  stateCreatedTime: Date.now(),
  recentEmoji: [],
  topPeers: [],
  recentSearch: [],
  stickerSets: {},
  version: STATE_VERSION,
  authState: {
    _: 'authStateSignIn'
  },
  hiddenPinnedMessages: {},
  settings: {
    messagesTextSize: 16,
    sendShortcut: 'enter',
    animationsEnabled: true,
    autoDownload: {
      contacts: true,
      private: true,
      groups: true,
      channels: true
    },
    autoPlay: {
      gifs: true,
      videos: true
    },
    stickers: {
      suggest: true,
      loop: true
    }
  },
  drafts: {}
};

const ALL_KEYS = Object.keys(STATE_INIT) as any as Array<keyof State>;

const REFRESH_KEYS = ['dialogs', 'allDialogsLoaded', 'messages', 'contactsList', 'stateCreatedTime',
  'updates', 'maxSeenMsgId', 'filters', 'topPeers'] as any as Array<keyof State>;

export class AppStateManager extends EventListenerBase<{
  save: (state: State) => Promise<void>
}> {
  public loaded: Promise<State>;
  private log = logger('STATE'/* , LogLevels.error */);

  private state: State;
  private savePromise: Promise<void>;
  private tempId = 0;

  constructor() {
    super();
    this.loadSavedState();
  }

  public loadSavedState() {
    if(this.loaded) return this.loaded;
    //console.time('load state');
    return this.loaded = new Promise((resolve) => {
      AppStorage.get<any>(...ALL_KEYS, 'user_auth').then((arr) => {
        let state: State = {};

        // ! then can't store false values
        ALL_KEYS.forEach((key, idx) => {
          const value = arr[idx];
          if(value !== false) {
            // @ts-ignore
            state[key] = value;
          } else {
            // @ts-ignore
            state[key] = copy(STATE_INIT[key]);
          }
        });

        const time = Date.now();
        if(state) {
          if(state.version !== STATE_VERSION) {
            state = copy(STATE_INIT);
          } else if((state.stateCreatedTime + REFRESH_EVERY) < time/*  && false */) {
            this.log('will refresh state', state.stateCreatedTime, time);
            REFRESH_KEYS.forEach(key => {
              // @ts-ignore
              state[key] = copy(STATE_INIT[key]);
            });
          }
        }

        validateInitObject(STATE_INIT, state);

        this.state = state;
        this.state.version = STATE_VERSION;

        // ! probably there is better place for it
        rootScope.settings = this.state.settings;

        this.log('state res', state);
        
        //return resolve();

        const auth: UserAuth = arr[arr.length - 1];
        if(auth) {
          // ! Warning ! DON'T delete this
          this.state.authState = {_: 'authStateSignedIn'};
          rootScope.broadcast('user_auth', typeof(auth) !== 'number' ? (auth as any).id : auth); // * support old version
        }
        
        //console.timeEnd('load state');
        resolve(this.state);
      }).catch(resolve).finally(() => {
        setInterval(() => {
          this.tempId++;
          this.saveState();
        }, 10000);
      });
    });
  }

  public getState() {
    return this.state === undefined ? this.loadSavedState() : Promise.resolve(this.state);
  }

  public saveState() {
    if(this.state === undefined || this.savePromise) return;

    const tempId = this.tempId;
    this.savePromise = Promise.all(this.setListenerResult('save', this.state)).then(() => {
      return AppStorage.set(this.state);
    }).then(() => {
      this.savePromise = null;

      if(this.tempId !== tempId) {
        this.saveState();
      }
    });
    //let perf = performance.now();
    
    //this.log('saveState: event time:', performance.now() - perf);

    //const pinnedOrders = appMessagesManager.dialogsStorage.pinnedOrders;

    //perf = performance.now();
    
    //this.log('saveState: storage set time:', performance.now() - perf);
  }

  public setByKey(key: string, value: any) {
    setDeepProperty(this.state, key, value);
    rootScope.broadcast('settings_updated', {key, value});
  }

  public pushToState<T extends keyof State>(key: T, value: State[T]) {
    this.state[key] = value;
  }

  public setPeer(peerId: number, peer: any) {
    const container = peerId > 0 ? this.state.users : this.state.chats;
    if(container.hasOwnProperty(peerId)) return;
    container[peerId] = peer;
  }

  public resetState() {
    for(let i in this.state) {
      // @ts-ignore
      this.state[i] = false;
    }
    AppStorage.set(this.state).then(() => {
      location.reload();
    });
  }
}

//console.trace('appStateManager include');

const appStateManager = new AppStateManager();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.appStateManager = appStateManager);
export default appStateManager;