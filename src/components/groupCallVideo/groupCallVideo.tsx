/* eslint-disable */
import {Portal, render, style} from 'solid-js/web';
import styles from './groupCallVideo.module.scss';
import {createSignal, createEffect, JSX, For, Accessor, onCleanup, createMemo, mergeProps, createContext, useContext, Context, ParentComponent, splitProps, untrack, on, getOwner, runWithOwner, createRoot, ParentProps, Suspense, batch, Signal, onMount, Setter, createReaction, Show, FlowComponent, useTransition, $TRACK, Owner, createRenderEffect, createResource} from 'solid-js';
import ButtonMenuToggle from '../buttonMenuToggle';
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
import PseudoField from './PseudoField/PseudoField';
import RoundButton from './RoundButton/RoundButton';

import notMutedIcon from './notmuted.svg';
import mutedIcon from './muted.svg';
import pipIcon from './pip.svg';
import fullScreenIcon from './fullscreen.svg';

const getGroupCallFromChatId = async(managers: AppManagers, chatId: string): Promise<InputGroupCall.inputGroupCall | undefined> => {
   try {
      const call = (await managers.appProfileManager.getChatFull(chatId)).call;
      if (!call) return;
      // now make sure that is rtmp group call, and not just any group call
      const groupCallInfo = await managers.appGroupCallsManager.getGroupCallFull(call.id);
      if (groupCallInfo._ === 'groupCall' && groupCallInfo.pFlags.rtmp_stream) return call;
   } catch (e) {}
}



const makeIframeUrl = (call: InputGroupCall.inputGroupCall, channel: GroupCallStreamChannel) => {
  return `/groupCallStream/${window.encodeURIComponent(JSON.stringify({ call, channel }))}`;
}

const getChatTitleAsString = async(chatId: string): Promise<string> => {
  let result;
  try { result = await apiManagerProxy.getChat(chatId); } catch (e) {}
  return (result?.title?.trim?.() || '');
}

const getChannel = async(managers: AppManagers, call: InputGroupCall.inputGroupCall): Promise<GroupCallStreamChannel.groupCallStreamChannel | undefined> => {
   try {
      const channels = (await managers.apiManager.invokeApi('phone.getGroupCallStreamChannels', { call })).channels;
      return channels.find(ch => ch.channel === 1);
   } catch (e) {
      console.info('getChannel error', e);
   }
}

const joinGroupCall = async(managers: AppManagers, call: InputGroupCall.inputGroupCall): Promise<boolean> => {
   try {
      const result = await managers.appGroupCallsManager.joinGroupCall(
       call.id, {
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
     return Boolean(result);
   } catch (e) {}
   return false;
}
 

interface Status {
  kind: string;
  data?: string;
}

const fetchRtmpCredentials = async(managers: AppManagers, chatId: string): Promise<{url: string, key: string} | undefined> => {
  
  let rtmpUrls;
//   let isAdmin = true;
  
  try {
    
    rtmpUrls = await managers.apiManager.invokeApi('phone.getGroupCallStreamRtmpUrl', {
      peer: await managers.appPeersManager.getInputPeerById(chatId.toPeerId(true)),
      revoke: false
    });

  } catch (error: any) {
   //  if (error?.type === 'CHAT_ADMIN_REQUIRED') {
      // isAdmin = false;
   //  }
  }

  const url = rtmpUrls?.url?.trim?.() || '';
  const key = rtmpUrls?.key?.trim?.() || '';
  if (url && key) return { url, key}
  

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

  const [ getRtmpUrls, setRtmpUrls ] = createSignal(null);
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
    video.onpause = onClose;
    video.onended = tryToReconnect;
  }

  const showRtmpUrlsIfNoVideoYet = () => {
   
  }

  const tryToReconnect = async(): Promise<any> => {

    if (!navigationItem) return;

    setIframeUrl('');
    setAudioOnly(false);
    setIsPlaying(false);
    setStatus({ kind: 'loading' });

    const groupCall = await getGroupCallFromChatId(managers, chatId);
    setGroupCallId(String(groupCall?.id || ''));

    if (!groupCall) {
      console.info('HERE')
      return onClose();
    }


    if (!(await joinGroupCall(managers, groupCall))) {
      console.info('here2')
      return onClose();
    }


    const channel = await getChannel(managers, groupCall);
    if (!channel) {
      console.info('NO CHANNEL');
      setRtmpUrls(await fetchRtmpCredentials(managers, chatId));
      return setTimeout(tryToReconnect, 4000);
    }
    

    setIframeUrl(makeIframeUrl(groupCall, channel));

    // const rtmpUrls = await getRtmpUrls(managers, chatId);
    // console.info({ rtmpUrls })
    
    
  }

  const onChatUpdate = async(updatedChatId: ChatId) => {
    if (String(updatedChatId) !== chatId) return;
    getChatTitleAsString(chatId).then(setChatTitle);
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
    video.requestFullscreen();
  }

  const smallAvatar = AvatarNew({ size: 42, peerId: chatId.toPeerId(true), isDialog: false });
  const hugeAvatar = AvatarNew({ size: 42, peerId: chatId.toPeerId(true), isDialog: false });


 
  const isMuted = () => getIsMuted();
  const getHasNoStream = () => !getIsPlaying();
  const getHasNoVideo = () => !getIsPlaying() || getAudioOnly();


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

   <div class={styles.videoWrapperOuter}>
      <div class={styles.videoWrapperInner}>
         
         <div class={styles.controls}>
            <div class={styles.status}>LIVE</div>

            <RoundButton
               size={36}
               onClick={toggleSound}
               disabled={getHasNoStream}
               title={() => isMuted() ? 'Unmute' : 'Mute'}
               icon={() => isMuted() ? mutedIcon : notMutedIcon}
            />

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

               
            <RoundButton
               size={36}
               onClick={goPiP}
               title="Picture in picture"
               icon={pipIcon}
               disabled={getHasNoVideo}
            />

            <RoundButton
               size={36}
               onClick={goFullscreen}
               title="Fullscreen mode"
               icon={fullScreenIcon}
               disabled={getHasNoVideo}
            />

         </div>

         {getHasNoVideo() && (
            <BluredSurface className={styles.blur}>
               {hugeAvatar.element}
            </BluredSurface>
         )}

         {getStatus().kind === 'error' && (
            <div>{getStatus().data}</div>
         )}

         {(getRtmpUrls() && !getIsPlaying()) && (
            <div class={styles.noStreamAdmin}>
               <div>Oops!</div>
               <div>
                  Telegram doesn't see any stream coming from your streaming app. Please make sure you entered the right Server URL and Stream Key in your app.
               </div>
               
               <PseudoField
                  icon={linkIcon}
                  hint="Server URL"
                  value={getRtmpUrls().url}
               />
               
               <PseudoField
                  icon={lockIcon}
                  password={true}
                  hint="Stream Key"
                  value={getRtmpUrls().key}
               />
            </div>
         )}

         {getIframeUrl() && (
            <iframe ref={iframeRef} onLoad={iframeOnLoad} src={getIframeUrl()}/>
         )}
      </div>

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
      <MyThing {...getProps()} 
      onClose={() => setProps(null)}
      />
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