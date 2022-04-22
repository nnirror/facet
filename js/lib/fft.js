module.exports = {
  icfft: (amplitudes) => {
    var N = amplitudes.length;
    var iN = 1 / N;

    //conjugate if imaginary part is not 0
    for(var i = 0 ; i < N; ++i)
    if(amplitudes[i] instanceof Complex)
    amplitudes[i].im = -amplitudes[i].im;

    //apply fourier transform
    amplitudes = module.exports.cfft(amplitudes)

    for(var i = 0 ; i < N; ++i)
    {
    //conjugate again
    amplitudes[i].im = -amplitudes[i].im;
    //scale
    amplitudes[i].re *= iN;
    amplitudes[i].im *= iN;
    }
    return amplitudes;
  },

  cfft: (amplitudes) => {
    var N = amplitudes.length;
    if( N <= 1 )
    return amplitudes;

    var hN = N / 2;
    var even = [];
    var odd = [];
    even.length = hN;
    odd.length = hN;
    for(var i = 0; i < hN; ++i)
    {
    even[i] = amplitudes[i*2];
    odd[i] = amplitudes[i*2+1];
    }
    even = module.exports.cfft(even);
    odd = module.exports.cfft(odd);

    var a = -2*Math.PI;
    for(var k = 0; k < hN; ++k)
    {
    if(!(even[k] instanceof Complex))
    even[k] = new Complex(even[k], 0);
    if(!(odd[k] instanceof Complex))
    odd[k] = new Complex(odd[k], 0);
    var p = k/N;
    var t = new Complex(0, a * p);
    t.cexp(t).mul(odd[k], t);
    amplitudes[k] = even[k].add(t, odd[k]);
    amplitudes[k + hN] = even[k].sub(t, even[k]);
    }
    return amplitudes;
  },
};

/*
basic complex number arithmetic from
http://rosettacode.org/wiki/Fast_Fourier_transform#Scala
*/
function Complex(re, im)
{
this.re = re;
this.im = im || 0.0;
}
Complex.prototype.add = function(other, dst)
{
dst.re = this.re + other.re;
dst.im = this.im + other.im;
return dst;
}
Complex.prototype.sub = function(other, dst)
{
dst.re = this.re - other.re;
dst.im = this.im - other.im;
return dst;
}
Complex.prototype.mul = function(other, dst)
{
//cache re in case dst === this
var r = this.re * other.re - this.im * other.im;
dst.im = this.re * other.im + this.im * other.re;
dst.re = r;
return dst;
}
Complex.prototype.cexp = function(dst)
{
var er = Math.exp(this.re);
dst.re = er * Math.cos(this.im);
dst.im = er * Math.sin(this.im);
return dst;
}
Complex.prototype.log = function()
{
}
