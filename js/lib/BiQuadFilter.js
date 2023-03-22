// copy-modded from: https://arachnoid.com/BiQuadDesigner/index.html
/***************************************************************************
 *   Copyright (C) 2017, Paul Lutus                                        *
 *                                                                         *
 *   This program is free software; you can redistribute it and/or modify  *
 *   it under the terms of the GNU General Public License as published by  *
 *   the Free Software Foundation; either version 2 of the License, or     *
 *   (at your option) any later version.                                   *
 *                                                                         *
 *   This program is distributed in the hope that it will be useful,       *
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of        *
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the         *
 *   GNU General Public License for more details.                          *
 *                                                                         *
 *   You should have received a copy of the GNU General Public License     *
 *   along with this program; if not, write to the                         *
 *   Free Software Foundation, Inc.,                                       *
 *   59 Temple Place - Suite 330, Boston, MA  02111-1307, USA.             *
 ***************************************************************************/

var BiQuadFilter = BiQuadFilter || {}


BiQuadFilter.LOWPASS = 0;
BiQuadFilter.HIGHPASS = 1;
BiQuadFilter.BANDPASS = 2;
BiQuadFilter.PEAK = 3;
BiQuadFilter.NOTCH = 4;
BiQuadFilter.LOWSHELF = 5;
BiQuadFilter.HIGHSHELF = 6;

BiQuadFilter.a0 = 0;
BiQuadFilter.a1 = 0;
BiQuadFilter.a2 = 0;
BiQuadFilter.b0 = 0;
BiQuadFilter.b1 = 0;
BiQuadFilter.b2 = 0;
BiQuadFilter.x1 = 0;
BiQuadFilter.x2 = 0;
BiQuadFilter.y1 = 0;
BiQuadFilter.y2 = 0;
BiQuadFilter.type = 0;
BiQuadFilter.center_freq = 0;
BiQuadFilter.sample_rate = 0;
BiQuadFilter.Q = 0;
BiQuadFilter.gainDB = 0;

BiQuadFilter.create = function(type, center_freq, sample_rate, Q, gainDB = 0) {
  BiQuadFilter.configure(type, center_freq, sample_rate, Q, gainDB);
}

BiQuadFilter.reset = function() {
  BiQuadFilter.x1 = BiQuadFilter.x2 = BiQuadFilter.y1 = BiQuadFilter.y2 = 0;
}

BiQuadFilter.frequency = function() {
  return BiQuadFilter.center_freq;
}

BiQuadFilter.configure = function(type,center_freq,sample_rate, Q, gainDB) {
  BiQuadFilter.functions = [
  BiQuadFilter.f_lowpass,
  BiQuadFilter.f_highpass,
  BiQuadFilter.f_bandpass,
  BiQuadFilter.f_peak,
  BiQuadFilter.f_notch,
  BiQuadFilter.f_lowshelf,
  BiQuadFilter.f_highshelf
  ];
  BiQuadFilter.reset();
  BiQuadFilter.Q = (Q == 0) ? 1e-9 : Q;
  BiQuadFilter.type = type;
  BiQuadFilter.sample_rate = sample_rate;
  BiQuadFilter.gainDB = gainDB;
  BiQuadFilter.reconfigure(center_freq);
}

// allow parameter change while running
BiQuadFilter.reconfigure = function(cf) {
  BiQuadFilter.center_freq = cf;
  // only used for peaking and shelving filters
  var gain_abs = Math.pow(10, BiQuadFilter.gainDB / 40);
  var omega = 2 * Math.PI * cf / BiQuadFilter.sample_rate;
  var sn = Math.sin(omega);
  var cs = Math.cos(omega);
  var alpha = sn / (2 * BiQuadFilter.Q);
  var beta = Math.sqrt(gain_abs + gain_abs);
  
  // call the corresponding setup function
  BiQuadFilter.functions[BiQuadFilter.type](gain_abs,omega,sn,cs,alpha,beta);
  
  // by prescaling filter constants, eliminate one variable
  BiQuadFilter.b0 /= BiQuadFilter.a0;
  BiQuadFilter.b1 /= BiQuadFilter.a0;
  BiQuadFilter.b2 /= BiQuadFilter.a0;
  BiQuadFilter.a1 /= BiQuadFilter.a0;
  BiQuadFilter.a2 /= BiQuadFilter.a0;
}

BiQuadFilter.f_bandpass = function(gain_abs,omega,sn,cs,alpha,beta) {
  BiQuadFilter.b0 = alpha;
  BiQuadFilter.b1 = 0;
  BiQuadFilter.b2 = -alpha;
  BiQuadFilter.a0 = 1 + alpha;
  BiQuadFilter.a1 = -2 * cs;
  BiQuadFilter.a2 = 1 - alpha;
}

BiQuadFilter.f_lowpass = function(gain_abs,omega,sn,cs,alpha,beta) {
  BiQuadFilter.b0 = (1 - cs) / 2;
  BiQuadFilter.b1 = 1 - cs;
  BiQuadFilter.b2 = (1 - cs) / 2;
  BiQuadFilter.a0 = 1 + alpha;
  BiQuadFilter.a1 = -2 * cs;
  BiQuadFilter.a2 = 1 - alpha;
}

BiQuadFilter.f_highpass = function(gain_abs,omega,sn,cs,alpha,beta) {
  BiQuadFilter.b0 = (1 + cs) / 2;
  BiQuadFilter.b1 = -(1 + cs);
  BiQuadFilter.b2 = (1 + cs) / 2;
  BiQuadFilter.a0 = 1 + alpha;
  BiQuadFilter.a1 = -2 * cs;
  BiQuadFilter.a2 = 1 - alpha;
}

BiQuadFilter.f_notch = function(gain_abs,omega,sn,cs,alpha,beta) {
  BiQuadFilter.b0 = 1;
  BiQuadFilter.b1 = -2 * cs;
  BiQuadFilter.b2 = 1;
  BiQuadFilter.a0 = 1 + alpha;
  BiQuadFilter.a1 = -2 * cs;
  BiQuadFilter.a2 = 1 - alpha;
}

BiQuadFilter.f_peak = function(gain_abs,omega,sn,cs,alpha,beta) {
  BiQuadFilter.b0 = 1 + (alpha * gain_abs);
  BiQuadFilter.b1 = -2 * cs;
  BiQuadFilter.b2 = 1 - (alpha * gain_abs);
  BiQuadFilter.a0 = 1 + (alpha / gain_abs);
  BiQuadFilter.a1 = -2 * cs;
  BiQuadFilter.a2 = 1 - (alpha / gain_abs);
}

BiQuadFilter.f_lowshelf = function(gain_abs,omega,sn,cs,alpha,beta) {
  BiQuadFilter.b0 = gain_abs * ((gain_abs + 1) - (gain_abs - 1) * cs + beta * sn);
  BiQuadFilter.b1 = 2 * gain_abs * ((gain_abs - 1) - (gain_abs + 1) * cs);
  BiQuadFilter.b2 = gain_abs * ((gain_abs + 1) - (gain_abs - 1) * cs - beta * sn);
  BiQuadFilter.a0 = (gain_abs + 1) + (gain_abs - 1) * cs + beta * sn;
  BiQuadFilter.a1 = -2 * ((gain_abs - 1) + (gain_abs + 1) * cs);
  BiQuadFilter.a2 = (gain_abs + 1) + (gain_abs - 1) * cs - beta * sn;
}

BiQuadFilter.f_highshelf = function(gain_abs,omega,sn,cs,alpha,beta) {
  BiQuadFilter.b0 = gain_abs * ((gain_abs + 1) + (gain_abs - 1) * cs + beta * sn);
  BiQuadFilter.b1 = -2 * gain_abs * ((gain_abs - 1) + (gain_abs + 1) * cs);
  BiQuadFilter.b2 = gain_abs * ((gain_abs + 1) + (gain_abs - 1) * cs - beta * sn);
  BiQuadFilter.a0 = (gain_abs + 1) - (gain_abs - 1) * cs + beta * sn;
  BiQuadFilter.a1 = 2 * ((gain_abs - 1) - (gain_abs + 1) * cs);
  BiQuadFilter.a2 = (gain_abs + 1) - (gain_abs - 1) * cs - beta * sn;
}

// provide a static amplitude result for testing
BiQuadFilter.result = function(f) {
  var phi = Math.pow((Math.sin(2.0 * Math.PI * f / (2.0 * BiQuadFilter.sample_rate))), 2.0);
  var r = (Math.pow(BiQuadFilter.b0 + BiQuadFilter.b1 + BiQuadFilter.b2, 2.0) - 4.0 * (BiQuadFilter.b0 * BiQuadFilter.b1 + 4.0 * BiQuadFilter.b0 * BiQuadFilter.b2 + BiQuadFilter.b1 * BiQuadFilter.b2) * phi + 16.0 * BiQuadFilter.b0 * BiQuadFilter.b2 * phi * phi) / (Math.pow(1.0 + BiQuadFilter.a1 + BiQuadFilter.a2, 2.0) - 4.0 * (BiQuadFilter.a1 + 4.0 * BiQuadFilter.a2 + BiQuadFilter.a1 * BiQuadFilter.a2) * phi + 16.0 * BiQuadFilter.a2 * phi * phi);
  r = (r < 0)?0:r;
  return Math.sqrt(r);
}

// provide a static decibel result for testing
BiQuadFilter.log_result = function(f) {
  var r;
  try {
    r = 20 * Math.log10(BiQuadFilter.result(f));
  }
  catch (e) {
    //console.log(e);
    r = -100;
  }
  if(!isFinite(r) || isNaN(r)) {
    r = -100;
  }
  return r;
}

// return the constant set for this filter
BiQuadFilter.constants = function() {
  return [BiQuadFilter.a1, BiQuadFilter.a2,BiQuadFilter.b0, BiQuadFilter.b1, BiQuadFilter.b2];
}

// perform one filtering step
BiQuadFilter.filter = function(x) {
  var y = BiQuadFilter.b0 * x + BiQuadFilter.b1 * BiQuadFilter.x1 + BiQuadFilter.b2 * BiQuadFilter.x2 - BiQuadFilter.a1 * BiQuadFilter.y1 - BiQuadFilter.a2 * BiQuadFilter.y2;
  BiQuadFilter.x2 = BiQuadFilter.x1;
  BiQuadFilter.x1 = BiQuadFilter.x;
  BiQuadFilter.y2 = BiQuadFilter.y1;
  BiQuadFilter.y1 = y;
  return (y);
}

BiQuadFilter.formatNumber = function(n,p) {
  return n.toFixed(p);
}

module.exports = {
  BiQuadFilter: BiQuadFilter
};

// filter type, cutoff, sr, q, gain
// BiQuadFilter.create(0,100,44100,2.5,1);
//   let lemma = [];
//   let out = [];
//   for(var i = 1; i < 6;i++) {
//     var v = BiQuadFilter.constants()[i-1]; // contains [a1,a2,b0,b1,b2]
//     v = BiQuadFilter.formatNumber(v,8);
//     lemma.push(v);
//   }
//   out[0] = lemma[2];
//   out[1] = lemma[3];
//   out[2] = lemma[4];
//   out[3] = lemma[0];
//   out[4] = lemma[1];
//   console.log(out);
//   // the numbers in out can go directly into biquad.
//   // all you need to do is create different functions that are for filter type: bandpass = 2, lowpass = 0, highpass = 1  to start
//   // then you send the sample rate constant and the gain as 1
//   // and it's only cutoff and q that are the arguments.