const clsx = (...classNames: any[]): string => {
  return classNames.filter(cn => typeof cn === 'string' && cn.trim()).join(' ');
}

export default clsx;