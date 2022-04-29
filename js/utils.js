function random(min = 0, max = 1, int_mode = 0) {
  let num = Math.random() * (Number(max) - Number(min)) + Number(min);
  if ( int_mode != 0 ) {
    num = Math.round(num);
  }
  return num;
}

function choose (list) {
  return list[Math.floor(Math.random()*list.length)];
}
