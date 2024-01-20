const formatWatching = (watching: any) => {
  if (Number.isInteger(watching) && watching > 0) {
    return `${watching.toLocaleString()} watching`;
  } else {
    return 'Nobody watching';
  }
}

export default formatWatching;