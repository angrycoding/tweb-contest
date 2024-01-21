/* eslint-disable */
import styles from './BluredSurface.module.scss';
import clsx from '../clsx';

const BluredSurface = (props: {
  className?: string,
  children?: any
}) => {

  return <div class={clsx(styles.wrapper, props.className)}>
    <div class={styles.bg}>{props.children}</div>
    <div class={styles.blur} />
    <div class={styles.stripe} />
    <div class={styles.border} />
  </div>
}

export default BluredSurface;