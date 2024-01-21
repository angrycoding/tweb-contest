/* eslint-disable */
import {createSignal, createEffect, JSX, For, Accessor, onCleanup, createMemo, mergeProps, createContext, useContext, Context, ParentComponent, splitProps, untrack, on, getOwner, runWithOwner, createRoot, ParentProps, Suspense, batch, Signal, onMount, Setter, createReaction, Show, FlowComponent, useTransition, $TRACK, Owner, createRenderEffect} from 'solid-js';
import styles from './PseudoField.module.scss';
import eyeIcon from './eye.svg';
import RoundButton from '../RoundButton/RoundButton';
import copyIcon from './copypaste.svg';

const PseudoField = (props: {
   icon: string,
   hint: string,
   value: string,
   password?: boolean
 }) => {
 
   const { icon, password, value } = props;
   const [ getIsShown, setIsShown ] = createSignal(false);
 
   return <div class={styles.pseudoField} style={{
      '--icon1': `url(${icon})`,
      '--icon2': password ? `url(${eyeIcon})` : undefined
   }} onClick={() => setIsShown(!getIsShown())}>
      <div>
         <input type={(!password || getIsShown()) ? 'text' : 'password'} value={value} />
         <div>{props.hint}</div>
      </div>
      <RoundButton
         icon={copyIcon}
         size={36}
         title="Copy to clipboard"
      />
   </div>;
 }
 
export default PseudoField; 