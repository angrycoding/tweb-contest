import {Portal, render, style} from 'solid-js/web';
import styles from './groupCallVideo.module.scss';
import {createSignal, createEffect, JSX, For, Accessor, onCleanup, createMemo, mergeProps, createContext, useContext, Context, ParentComponent, splitProps, untrack, on, getOwner, runWithOwner, createRoot, ParentProps, Suspense, batch, Signal, onMount, Setter, createReaction, Show, FlowComponent, useTransition, $TRACK, Owner, createRenderEffect} from 'solid-js';
import ButtonMenuToggle from '../buttonMenuToggle';
import eyeIcon from './eye.svg';
import linkIcon from './link.svg';
import lockIcon from './lock.svg';
import { AppManagers } from '../../lib/appManagers/managers';
import { ChatFull, GroupCall, GroupCallStreamChannel, InputGroupCall } from '../../layer';
import apiManagerProxy from '../../lib/mtproto/mtprotoworker';
import { ApiManager } from '../../lib/mtproto/apiManager';
import { nextRandomUint } from '../../helpers/random';
import rootScope from '../../lib/rootScope';
import appNavigationController, { NavigationItem } from '../appNavigationController';
import { AvatarNew } from '../avatarNew';
import BluredSurface from './BluredSurface/BluredSurface';
import clsx from './clsx';
import formatWatching from './formatWatching';

const makeIframeUrl = (call: InputGroupCall.inputGroupCall, channel: GroupCallStreamChannel) => {
  return `/groupCallStream/${window.encodeURIComponent(JSON.stringify({ call, channel }))}`;
}

const getChatTitleAsString = async(managers: AppManagers, chatId: string): Promise<string> => {
  let result;
  try { result = await apiManagerProxy.getChat(chatId); } catch (e) {}
  return (result?.title?.trim?.() || '');
}

const btnMenu = ButtonMenuToggle({
  // listenerSetter: this.listenerSetter,
  direction: 'bottom-left',
  buttons: [{
    icon: 'logout',
    text: 'EditAccount.Logout',
    onClick: () => {
      // PopupElement.createPopup(PopupPeer, 'logout', {
      //   titleLangKey: 'LogOut',
      //   descriptionLangKey: 'LogOut.Description',
      //   buttons: [{
      //     langKey: 'LogOut',
      //     callback: () => {
      //       this.managers.apiManager.logOut();
      //     },
      //     isDanger: true
      //   }]
      // }).show();
    }
  }]
});

const PseudoField = (props: {
  icon1: string,
  icon2?: string,
  hint: string,
  value: string
}) => {

  const [ getIsShown, setIsShown ] = createSignal(false);

  const replace = (value: string) => {
    if (getIsShown()) {
      return value;
    } else {
      return value.split('').map(() => '•').join('')
    }
  }

  return (
    <div class={styles.pseudoField} style={{
      '--icon1': `url(${props.icon1})`,
      '--icon2': props.icon2 && `url(${props.icon2})`
    }} onClick={() => setIsShown(!getIsShown())}>
      <div>
        <input type={getIsShown() ? 'text' : 'password'} value={props.value} />
        <div>{props.hint}</div>
      </div>
    </div>
  )
}


interface Status {
  kind: string;
  data?: string;
}

const getRtmpUrls = async(managers: AppManagers, chatId: string): Promise<{isAdmin: boolean, url: string, key: string}> => {
  
  let rtmpUrls;
  let isAdmin = true;
  
  try {
    
    rtmpUrls = await managers.apiManager.invokeApi('phone.getGroupCallStreamRtmpUrl', {
      peer: await managers.appPeersManager.getInputPeerById(chatId.toPeerId(true)),
      revoke: false
    });

  } catch (error: any) {
    if (error?.type === 'CHAT_ADMIN_REQUIRED') {
      isAdmin = false;
    }
  }

  const url = rtmpUrls?.url?.trim?.() || '';
  const key = rtmpUrls?.key?.trim?.() || '';

  return {
    isAdmin,
    url: (url && key ? url : ''),
    key: (url && key ? key : '')
  }

}

const getChatFull = async(managers: AppManagers, chatId: string): Promise<ChatFull.channelFull | ChatFull.chatFull | undefined> => {
  let chatFull;
  try { chatFull = await managers.appProfileManager.getChatFull(chatId); } catch (e) {}
  return chatFull;
}

const MyThing = (props: {
  chatId: string,
  managers: AppManagers,
  onClose: () => void
}) => {

  const { chatId, onClose, managers } = props;

  let iframeRef: HTMLIFrameElement | null = null;
  const [ getStatus, setStatus ] = createSignal<Status>({
    kind: 'loading'
  });

  let navigationItem: NavigationItem | null = null;

  const [ getChatTitle, setChatTitle ] = createSignal('');
  const [ getGroupCallTitle, setGroupCallTitle ] = createSignal('');
  const [ getGroupCallWatching, setGroupCallWatching ] = createSignal(0);

  const [ getAudioOnly, setAudioOnly ] = createSignal(false);
  const [ getIsPlaying, setIsPlaying ] = createSignal(false);
  const [ getIsMuted, setIsMuted ] = createSignal(false);
  const [ getGroupCallId, setGroupCallId ] = createSignal('');
  const [ getIsAdminView, setIsAdminView ] = createSignal(false);
  const [ getIframeUrl, setIframeUrl ] = createSignal('');

  const onPlay = (event: Event) => {
   const target = (event.target as HTMLVideoElement);
   if (!target) return;
   setIsPlaying(true);
   setAudioOnly(!Boolean(target.videoWidth || target.videoHeight));
  }

  const iframeOnLoad = () => {
    const video = iframeRef.contentDocument.querySelector('video');
    video.controls = false;
    video.style.width = video.style.height = '100%';
    video.onplay = onPlay;
  }

  const tryToReconnect = async() => {

    if (!navigationItem) return;
    console.info('tryToReconnect');

    setIframeUrl('');
    setGroupCallId('');
    setAudioOnly(false);
    setIsPlaying(false);
    setStatus({ kind: 'loading' });

    const chatFull = await getChatFull(managers, chatId);
    if (!chatFull) return onClose();
    
    const groupCall = chatFull.call;
    if (!groupCall) return onClose();

    setGroupCallId(String(groupCall.id));


    let joinResult;

    try {
      joinResult = await managers.appGroupCallsManager.joinGroupCall(
        groupCall.id, {
          _:'dataJSON',
          data: JSON.stringify({
            'fingerprints': [],
            'pwd': '',
            'ssrc': nextRandomUint(32),
            'ssrc-groups': [],
            'ufrag': ''
          })
        },
        {'type': 'main'}
      );
    } catch (e) {}

    if (!joinResult) {
      if (!navigationItem) return;
      setTimeout(tryToReconnect, 4000);
      return setStatus({ kind: 'error', data: 'join failure' });
    }




    // const rtmpUrls = await getRtmpUrls(managers, chatId);
    // console.info({ rtmpUrls })
    
    // try { channels = (await managers.apiManager.invokeApi('phone.getGroupCallStreamChannels', { call: groupCall })).channels; } catch (e) {}
    // console.info({ channels });


    console.info('WE ARE FINE HERE', groupCall.id)

    let channel;
    // const rtmpUrls = await getRtmpUrls(managers, chatId);
    // console.info({ rtmpUrls })
    
    try {
      const channels = (await managers.apiManager.invokeApi('phone.getGroupCallStreamChannels', { call: groupCall })).channels;
      channel = channels.find(ch => ch.channel === 1);
    } catch (e) {
      console.info(e)
    }
    
    if (!channel) {
      if (!navigationItem) return;
      console.info('JOIN_FAIL')
      setTimeout(tryToReconnect, 4000);
      return setStatus({ kind: 'error', data: 'join failure' });
    }

    // setIframeUrl(`http://localhost:8080/groupCallStream/?id=${groupCall.id}`);
    setIframeUrl(makeIframeUrl(groupCall, channel));
  }

  const onChatUpdate = async(updatedChatId: ChatId) => {
    if (String(updatedChatId) !== chatId) return;
    getChatTitleAsString(managers, chatId).then(setChatTitle);
  }

  const onGroupCallUpdate = async(groupCall: GroupCall) => {
    if (String(groupCall.id) !== getGroupCallId()) return;
    if (groupCall._ === 'groupCall') {
      const newTitle = (groupCall.title || '');
      const participantsCount = (groupCall?.participants_count);
      if (getGroupCallTitle() !== newTitle) {
        setGroupCallTitle(newTitle);
      }
      if (getGroupCallWatching() !== participantsCount) {
        setGroupCallWatching(participantsCount);
      }
    } else if (groupCall._ === 'groupCallDiscarded') {
      tryToReconnect();
    }
  }

  onMount(async() => {
    onChatUpdate(chatId);
    appNavigationController.pushItem(navigationItem = { type: 'voice', onPop: onClose });
    rootScope.addEventListener('chat_update', onChatUpdate);
    rootScope.addEventListener('group_call_update', onGroupCallUpdate);
    tryToReconnect();
  });

  onCleanup(async() => {
    if (navigationItem) {
      appNavigationController.removeItem(null);
      navigationItem = null;
    }
    rootScope.removeEventListener('chat_update', onChatUpdate);
    rootScope.removeEventListener('group_call_update', onGroupCallUpdate);
  });

  const goPiP = () => {
    const video = iframeRef.contentDocument.querySelector('video');
    if (!video) return;
    video.requestPictureInPicture();
  }

  const toggleSound = () => {
    const video = iframeRef.contentDocument.querySelector('video');
    if (!video) return;
    setIsMuted(video.muted = !video.muted)
  }

  const goFullscreen = () => {
    const video = iframeRef.contentDocument.querySelector('video');
    if (!video) return;
    video.requestFullscreen().then(x => {
      console.info('x', x)
    }).catch(y => {
      console.info('y', y)
    });
  }

  const smallAvatar = AvatarNew({ size: 42, peerId: chatId.toPeerId(true), isDialog: false });
  const hugeAvatar = AvatarNew({ size: 42, peerId: chatId.toPeerId(true), isDialog: false });

  return <div class={clsx(
      styles.outerWrapper,
      getIsPlaying() && styles.live,
      getAudioOnly() && styles.audioOnly
   )}>

    <div class={styles.header}>
      <div class={styles.avatar}>
        {smallAvatar.element}
      </div>
      <div class={styles.titles}>
        <div>{getChatTitle()}</div>
        <div>{getGroupCallTitle()}</div>
      </div>
      <div class={styles.share} />
      <div class={styles.cross} onClick={onClose} />
    </div>

    <div class={styles.videoWrapper}>
      
      <div class={styles.controls}>
        <div class={styles.status}>LIVE</div>
        <div class={clsx(styles.speaker, getIsMuted() && styles.muted)} onClick={toggleSound} />
        <div class={styles.watching}>{formatWatching(getGroupCallWatching())}</div>
        <div class={styles.spacer} />
        {getIsAdminView() && (
          <div class={styles.menuButton} tabIndex={0}>
            <div class={styles.icon} />
            <div class={styles.menu}>
              <div>
                <span />
                <div>Output Device</div>
              </div>
              <div>
              <span />
                <div>Start Recording</div>
              </div>
              <div>
                <span />
                <div>Stream Settings</div>
              </div>
              <div>
                <span />
                <div>End Live Stream</div>
              </div>
            </div>
          </div>
        )}
        <div class={styles.pip} onClick={goPiP} />
        <div class={styles.fullscreen} onClick={goFullscreen} />
      </div>

      <BluredSurface className={styles.blur}>
          {hugeAvatar.element}
      </BluredSurface>

      {getStatus().kind === 'error' && (
        <div>{getStatus().data}</div>
      )}

      {/* <div class={styles.noStreamAdmin}>
          <div>Oops!</div>
          <div>
            Telegram doesn't see any stream coming from your streaming app. Please make sure you entered the right Server URL and Stream Key in your app.
          </div>
          
          <PseudoField
            icon1={linkIcon}
            hint="Server URL"
            value='rtmps://dc4-1.rtmp.t.me/s/safdsadfsdfasd'
          />
          
          <PseudoField
            icon1={lockIcon}
            icon2={eyeIcon}
            hint="Stream Key"
            value='very secret key'
          />
      </div> */}

      {getIframeUrl() && (
        <iframe ref={iframeRef} onLoad={iframeOnLoad} src={getIframeUrl()}/>
      )}
    </div>

  </div>
}

const MyThingWrapper = () => {

  const [ getProps, setProps ] = createSignal(null);

  const onShow = (event: Event) => {
    const [ chatId, managers ] = (event as CustomEvent<any>).detail;
    setProps({
      chatId,
      managers
    })
  }

  onMount(() => {
    window.addEventListener('show-the-thing', onShow);
  });

  onCleanup(() => {
    window.removeEventListener('show-the-thing', onShow);
  })

  return <Portal>
    {getProps() && (
      <MyThing {...getProps()} onClose={() => setProps(null)} />
    )}
  </Portal>
}

render(() => (
  <MyThingWrapper />
), document.body)

export default {
  show: (
    chatId: string | number,
    managers: AppManagers
  ) => {
    if (typeof chatId === 'number') chatId = String(chatId);
    window.dispatchEvent(new CustomEvent<any>('show-the-thing', {
      detail: [
        chatId,
        managers
      ]
    }));
  }
};