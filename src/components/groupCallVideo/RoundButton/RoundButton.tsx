/* eslint-disable */
import styles from './RoundButton.module.scss';
import clsx from '../clsx';


const callIt = (v: any) => {
   if (typeof v === 'function') {
      return v();
   }
   return v;
}

const RoundButton = (props: {
   icon: any,
   size: number,
   title?: any;
   disabled?: any
   className?: string,
   onClick?: (event: MouseEvent) => void
 }) => {
 
   const { icon, size, className, disabled, title, onClick } = props;

   return <div class={clsx(styles.wrapper, callIt(disabled) && styles.disabled, className)} style={{
      '--icon': `url(${callIt(icon)})`,
      '--size': `${size}px`
   }} onClick={onClick} title={callIt(title)} />;
 }
 
export default RoundButton; 