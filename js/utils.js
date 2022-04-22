function random(min = 0, max = 1, int_mode = 0) {
  // returns number within range
  if ( int_mode != 1 && int_mode != 0 ) {
    throw `int_mode must be 1 or 0 if specified`;
  }
  let num = Math.random() * (Number(max) - Number(min)) + Number(min);
  if ( int_mode != 0 ) {
    num = Math.round(num);
  }
  return num;
}

function choose (list) {
  return list[Math.floor(Math.random()*list.length)];
}
