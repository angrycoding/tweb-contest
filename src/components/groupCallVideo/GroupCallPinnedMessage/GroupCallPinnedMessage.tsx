/* eslint-disable */
import { createSignal, onCleanup, onMount } from 'solid-js';
import styles from './GroupCallPinnedMessage.module.scss';
import rootScope from '../../../lib/rootScope';
import { ChatFull, GroupCall } from '../../../layer';
import groupCallVideo from '../groupCallVideo';
import { AppManagers } from '../../../lib/appManagers/managers';
import formatWatching from '../formatWatching';

const GroupCallPinnedMessage = (props: {
  chatId: ChatId,
  onClose: () => void,
  managers: AppManagers
}) => {

  let groupCallId: string = '';
  const { chatId, managers, onClose } = props;
  const [ getGroupCallId, setGroupCallId ] = createSignal('');
  const [ getGroupCallTitle, setGroupCallTitle ] = createSignal('');
  const [ getGroupCallWatching, setGroupCallWatching ] = createSignal(0);
  
  const onGroupCallUpdate = async(groupCall: GroupCall) => {
    if (String(groupCall.id) !== groupCallId) return;
    if (groupCall._ === 'groupCall') {
      const newTitle = (groupCall.title || '');
      if (newTitle !== getGroupCallTitle()) {
        setGroupCallTitle(newTitle)
      }
      const participantsCount = (groupCall?.participants_count);
      if (getGroupCallWatching() !== participantsCount) {
        setGroupCallWatching(participantsCount);
      }
    } else if (groupCall._ === 'groupCallDiscarded') {
      onClose?.();
    }
  }

  onMount(async() => {
    let chatFull;
    try { chatFull = await managers.appProfileManager.getChatFull(chatId); } catch (e) {}
    if (!chatFull) return;
    const groupCall = chatFull.call;
    if (!groupCall) return;
    groupCallId = String(groupCall.id);
    try {
      const groupCall = await managers.appGroupCallsManager.getGroupCallFull(groupCallId);
      if (groupCall._ === 'groupCall' && groupCall.pFlags.rtmp_stream) {
        setGroupCallId(String(groupCall.id));
        onGroupCallUpdate(groupCall);
        rootScope.addEventListener('group_call_update', onGroupCallUpdate);
      }
    } catch (e) {}
  })

  onCleanup(async() => {
    rootScope.removeEventListener('group_call_update', onGroupCallUpdate);
  });

  const joinGroupCall = () => {
    groupCallVideo.show(
      chatId,
      managers
    );
  }


  return <>
    {getGroupCallId() && (
      <div class={styles.wrapper} onClick={joinGroupCall}>
        <div class={styles.innerWrapper}>
          <div class={styles.bg} />
          <div class={styles.line} />
          <div class={styles.textAndButton}>
            <div>
              <div>{getGroupCallTitle() || 'Live Stream'}</div>
              <div>{formatWatching(getGroupCallWatching())}</div>
            </div>
            <div class={styles.button}>JOIN</div>
          </div>
        </div>
      </div>
    )}
  </>
}

export default GroupCallPinnedMessage;