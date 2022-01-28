/********************************************************/
/* declicker						*/
/* created: 98/11/20 Joachim Schurig			*/
/* modified: 99/05/09 Joachim Schurig			*/
/* this program is under the GPL			*/
/* contact: jschurig@zedat.fu-berlin.de			*/
/********************************************************/
/*							*/
/* define macos, unix or windows			*/
/* (if not already done in Makefile or system headers)	*/
/* #define unix						*/
/*							*/
/* if your libc has ftruncate(), define has_ftruncate	*/
/* (if not already done in Makefile)			*/
/* #define has_ftruncate				*/
/*							*/
/* define or undefine development flag			*/
/* (if not already done in Makefile)			*/
/* better you let it always defined (see Makefile)	*/
/* #define development					*/
/*							*/
/* define or undefine with_index flag			*/
/* (if not already done in Makefile)			*/
/* #define with_index					*/
/*							*/
/********************************************************/
/* that looks a bit stupid, but lets me automatically 	*/
/* compile the code with either windows or linux	*/
/********************************************************/
#ifndef unix		/*				*/
   #ifndef macos	/*				*/
     #ifndef windows	/*				*/
       #define windows	/*				*/
     #endif		/*				*/
   #endif		/*				*/
#endif			/*				*/
/********************************************************/


#define DEFAULT_FILE_PERMISSIONS S_IRUSR+S_IWUSR+S_IRGRP+S_IROTH

#define default_max_zero 1	/* noise floor to be skipped at		*/
				/* the beginning and end of a track	*/

#define vnum "0.6.5"		/* version number			*/

#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <ctype.h>
#include <fcntl.h>

#ifndef windows
  #include <unistd.h>
#endif

#ifdef macos
  #include <console.h>
  #include <stat.h>
#else
  #include <sys/stat.h>
#endif

#ifdef windows
  #include <io.h>
  #define inline
  #define development
#endif

#ifndef true
  #define true 1
  #define false 0
#endif

#ifndef L_ENDIAN
  #ifndef B_ENDIAN
    #ifdef macos
      #define B_ENDIAN
    #else
      #define L_ENDIAN
    #endif
  #endif
#endif

#ifndef SHORT_MAX
# define SHORT_MAX  ((short)(((unsigned short) -1) >> 1))
# define SHORT_MIN  (~SHORT_MAX)
#endif

#ifndef INT_MAX
# define INT_MAX    ((int)(((unsigned int) -1) >> 1))
# define INT_MIN    (~INT_MAX)
#endif

#ifndef LONG_MAX
# define LONG_MAX   ((long)(((unsigned long) -1) >> 1))
# define LONG_MIN   (~LONG_MAX)
#endif

#ifdef macos
  #define dirsep(c) (c == ':')
#endif
#ifdef unix
  #define dirsep(c) (c == '/')
#endif
#ifndef dirsep
  #define dirsep(c) (c == '\\')
#endif


/* some global vars */

static int do_declick		= 0;
static int develop		= 0;
static int devchan		= 0;
static int test			= 0;
static int last_ended_silently	= 1;
static int max_zero		= default_max_zero;
static int lead_silence		= 0;
static int trail_silence	= 0;
static int leadoffs		= 0;
static int skip_lzeroes		= 0;
static int skip_tzeroes		= 0;
static int max_lskip_sec	= 10000;
static int max_tskip_sec	= 10000;
static int max_lskip		= INT_MAX;
static int max_tskip		= INT_MAX;
static int create_index		= 0;
static int limits		= 0;
static int limitdiff		= 32767*2;
static int rough_cut		= 0;
static int padding		= 0;
static int quiet		= 0;

/* some common functions  */

static void del_path(char *s)
{
  int x;

  x = strlen(s);
  while (x > 0 && !dirsep(s[x - 1]))
    x--;
  strcpy(s, &s[x]);
}

static void waitforreturn(void)
{
	printf("press return...");
	getc(stdin);
}

static int calc_prozent(int v1, int v2)
{
  if (v2 > 100000L)
    return (v1 / (v2 / 100));
  else if (v2 > 0)
    return (v1 * 100 / v2);
  else
    return (0);
}

#ifdef has_ftruncate
static int fcopy(int handle, int start, int size, int newstart)
{
	char *copybuf;
	int copylen, copynow;
	int copied = 0;

	if (size > 256*1024) copylen = 256*1024;
	else copylen = size;

	copybuf = malloc(copylen);
	if (copybuf == NULL) {
		copylen = 1024;
		copybuf = malloc(copylen);
		if (copybuf == NULL) return(-1);
	}

	while (copied < size) {
		if (lseek(handle, start, SEEK_SET) != start) {
			free(copybuf);
			return(-1);
		}
		copynow = copylen;
		if (copynow > size) copynow = size;
		if (read(handle, copybuf, copynow) != copynow) {
			free(copybuf);
			return(-1);
		}
		start += copynow;
		if (lseek(handle, newstart, SEEK_SET) != newstart) {
			free(copybuf);
			return(-1);
		}
		if (write(handle, copybuf, copynow) != copynow) {
			free(copybuf);
			return(-1);
		}
		newstart += copynow;
		copied += copynow;
	}
	free(copybuf);
	return(0);
}

static int copy_and_trunc(int handle, int *fsize, int track_end, int track_end_old)
{
	int newfsize;

	if (track_end_old < *fsize) { /* copy following chunks (if present) */
		if (fcopy(handle, track_end_old, *fsize - track_end_old, track_end) < 0)
			return(-1);
	}

	newfsize = *fsize - (track_end_old - track_end);
	if (ftruncate(handle, newfsize) < 0) return(-1);
	*fsize = newfsize;
	return(0);
}
#endif


/* definition of a RIFF chunk header	*/

typedef struct {
	char id[4];
	int len;
} chunk_hdr;

/* definition of a WAVE format chunk	*/

typedef struct {
	short FormatTag;
	unsigned short Channels;
	unsigned int SamplesPerSec;
	unsigned int AvgBytesPerSec;
	unsigned short BlockAlign;
	unsigned short BitsPerSample;
} FormatChunk;

/* definition of a single 16bit stereo sample	*/

typedef struct {
	short chanA;
	short chanB;
} Sample16Stereo;



/* swap functions on big endian cpu's	*/

#ifdef B_ENDIAN

static inline void swap2(short int *two)
{
	unsigned char a, *p;
	
	p = (unsigned char *)two;
	a = p[0];
	p[0] = p[1];
	p[1] = a;
}

static inline void swap4(int *four)
{
	unsigned char a, *p;
	
	p = (unsigned char *)four;
	a = p[0];
	p[0] = p[3];
	p[3] = a;
	a = p[1];
	p[1] = p[2];
	p[2] = a;
}

static inline void swap_sample(Sample16Stereo *sample)
{
	swap2(&sample->chanA);
	swap2(&sample->chanB);
}

static inline void swap_chunk(chunk_hdr *chunk)
{
	swap4(&chunk->len);
}

static inline void swap_fmtchunk(FormatChunk *chunk)
{
	swap2(&chunk->FormatTag);
	swap2(&chunk->Channels);
	swap4(&chunk->SamplesPerSec);
	swap4(&chunk->AvgBytesPerSec);
	swap2(&chunk->BlockAlign);
	swap2(&chunk->BitsPerSample);
}
#endif


#ifdef with_index

/* index file generation					*/
/* the index file is generated in broadcast v2.1 format		*/
/* unfortunately we have to use that hughe index file size	*/
/* because broadcast aligns improperly if we set it lower	*/

#define INDEXFILESIZE	1000000
#define IX_HEADERLEN	40

static int	ix_handle		= -1;
static int	ix_samples		= 0;
static int	ix_scale;
static int	really_create_index 	= 0;
static char	*ix_buffer		= NULL;
static int	ix_bsize		= 0;
static char	ix_fname[256];


static void putfour(int handle, int number)
{
	int	v;
	
  	v = (number & 0xff000000) >> 24;
	write(handle, &v, 1);
	v = (number & 0xff0000) >> 16;
	write(handle, &v, 1);
  	v = (number & 0xff00) >> 8;
	write(handle, &v, 1);
	v = (number & 0xff);
	write(handle, &v, 1);
}


static void close_indexfile(int delete)
{
	if (ix_buffer != NULL) {
		if (!delete) {
			if(lseek(ix_handle, IX_HEADERLEN, SEEK_SET) == IX_HEADERLEN) {
				if (write(ix_handle, ix_buffer, ix_bsize) != ix_bsize) {
					delete = 1;
				}
			}
			else delete = 1;
		}
		free(ix_buffer);
	}
	else delete = 1;

	if (really_create_index && ix_handle >= 0)
		close(ix_handle);
		
	ix_handle = -1;
	ix_buffer = NULL;
	really_create_index = 0;
	if (delete) {
		fprintf(stderr, "\nerror creating index file\n");
		unlink(ix_fname);
	}
	ix_fname[0] = '\0';
}


static void create_indexfile(char *wavname, int samples, int pad_samples)
{
	int	dummy, x;
	char	*p;
	char	hs[256];
        
	ix_fname[0] = '\0';
	ix_scale = 1;
	while ((samples + pad_samples) / ix_scale > INDEXFILESIZE / 8)
      	      	ix_scale *= 2;

	if (ix_scale < 8) {
		really_create_index = 0;
		return;
	}
	
/*	if (ix_scale < 256) ix_scale = 256; / * unfortunately, that causes problems with the alignment in broadcast itself */
		
	ix_samples = ((samples + pad_samples) / ix_scale) * 2;
	really_create_index = 1;
	ix_bsize = ix_samples*4;
	ix_buffer = malloc(ix_bsize);
	if (ix_buffer == NULL) {
		ix_bsize = 0;
		really_create_index = 0;
		return;
	}
	
	if (pad_samples > 0) {
/* clear end of index buffer because of the padded samples (those are zeroes) */
		x = ix_bsize - ((pad_samples / ix_scale) * 2 * 4 + 1);
		p = &ix_buffer[x];
		for ( ; x < ix_bsize; x++) *p++ = 0;
	}
	
	strcpy(hs, wavname);
	strcat(hs, ".idx");
	unlink(hs);
#ifdef macos
	ix_handle = open(hs, O_WRONLY+O_CREAT);
#endif
#ifdef windows
	ix_handle = open(hs, O_WRONLY+O_BINARY+O_CREAT);
#endif
#ifdef unix
	ix_handle = open(hs, O_WRONLY+O_CREAT, DEFAULT_FILE_PERMISSIONS);
#endif
	if (ix_handle < 0) {
		really_create_index = 0;
		return;
	}

	putfour(ix_handle, ix_scale);
	putfour(ix_handle, 0);
	putfour(ix_handle, 0);
	putfour(ix_handle, 0);
	putfour(ix_handle, 0);
	putfour(ix_handle, 0);
	
	dummy = IX_HEADERLEN;					/* start chan A */
	putfour(ix_handle, dummy);
	dummy = IX_HEADERLEN + ix_samples*2;			/* end   chan A	*/
	putfour(ix_handle, dummy);
	dummy = IX_HEADERLEN + ix_samples*2;			/* start chan B	*/
	putfour(ix_handle, dummy);
	dummy = IX_HEADERLEN + ix_samples*2*2;			/* end   chan B	*/
	putfour(ix_handle, dummy);
		
	if (!quiet) printf("Index   : %s with scale %d\n", hs, ix_scale);
	strcpy(ix_fname, hs);	

	/* the index file preamble is now set up and may be filled with data	*/
	/* this will happen when a sample buf (below) gets flushed		*/
}

static void write_indexfile(int startsample, char *buf, int bsize)
{
	register int		x, y, samples, remainder, lscale;
	int			track;
	register short int 	*highsample, *lowsample, *inbuffer;
#ifdef B_ENDIAN
	short int		sample;
#else
	register short int	sample;
#endif

	if (startsample < 0) return;
	lscale = ix_scale;
	samples = bsize / 4;				/* count of input samples	*/
	if (startsample + samples > (ix_bsize / 4) * lscale) {
		samples = ((ix_bsize / 4) * lscale) - startsample;
	}
	samples	= samples / lscale;			/* = count of output samples	*/
	x = samples * 4 + (startsample/lscale)*4+ix_bsize/2;
	if (x > ix_bsize) {				/* overflow, dunno why		*/
		y = (x - ix_bsize) / 4;			/* maybe someone gets help me counting ... */
		remainder = (bsize - samples*lscale*4)/4 + y;
		samples -= y;
	}
	else {
		remainder = (bsize - samples*lscale*4)/4; /* for the last sample block	*/
	}
	if (samples > 0) {
	
		for (track = 0; track < 2; track++) {
		
			highsample = (short int *)&ix_buffer[(startsample/lscale)*4 + track*(ix_bsize/2)];
			highsample -= 2;
			lowsample = highsample + 1;
			inbuffer = (short int *)&buf[track*2];
			for (y = 0; y < samples; y++) {
				highsample += 2;
				lowsample += 2;
				sample = *inbuffer;
#ifdef B_ENDIAN
				swap2(&sample);
#endif
	        		*lowsample = *highsample = sample;
				inbuffer += 2;
				for (x = 1; x < lscale; x++) {
					sample = *inbuffer;
#ifdef B_ENDIAN
					swap2(&sample);
#endif
					if (sample > *highsample) *highsample = sample;
					else if (sample < *lowsample) *lowsample = sample;
					inbuffer += 2;
				}
			}
			for (x = 0; x < remainder; x++) {
				sample = *inbuffer;
#ifdef B_ENDIAN
				swap2(&sample);
#endif
				if (sample > *highsample) *highsample = sample;
				else if (sample < *lowsample) *lowsample = sample;
				inbuffer += 2;
			}
		
		}
	
	}
}

#endif /* of with_index */

/* buffer struct for buffered file i/o */

#define rbmagic 1762429
#define rbufct 2

typedef struct {
	int valid;
	int fhandle;
	int rw;
	int changed;
	char *base;
	int size;
	int filled;
	int fstart;
	int fwstart;
	int startsample;
} rbufstruct;

static int nothit = 0;	/* this is a debug counter. it should remain 0		*/
static rbufstruct rbuf[rbufct];
static int lastrrbuf = rbufct;
static int nowfpos = -1;

/* buffer control for buffered file i/o						*/
/* the file is subsequently read into two buffers of about 256kB of size	*/
/* this helps speeding up that **** windows for simple reads and writes		*/

static inline int assign_rrbuf(void)
{
	if (++lastrrbuf >= rbufct) lastrrbuf = 0;
	if (rbuf[lastrrbuf].valid != rbmagic) return(-1);
	return(lastrrbuf);
}

static inline int find_rbuf(int handle, int seekpos, int size)
{
	static int lastfound = 0;
	int x;

/* this should help speeding up the buffer search. find_rbuf() is called with	*/
/* every read/write of a sample							*/

	if (rbuf[lastfound].valid == rbmagic 
		&& handle == rbuf[lastfound].fhandle
		&& seekpos >= rbuf[lastfound].fstart
		&& seekpos+size <= rbuf[lastfound].fstart+rbuf[lastfound].filled) 
		return(lastfound);	  
	
/* new buffer in game. scan through buffers					*/

	for (x = 0; x < rbufct; x++) {
		if (rbuf[x].valid == rbmagic 
			&& handle == rbuf[x].fhandle
			&& seekpos >= rbuf[x].fstart
			&& seekpos+size <= rbuf[x].fstart+rbuf[x].filled) {
			lastfound = x; 
			return(x);
		}
	}
	return(-1);
}

static void init_rbuf(int size)
{
	int x;
	char *z = NULL;

	lastrrbuf = 0;
	nowfpos = -1;
	if (size < 0) size = 256*1024;	/* size should be any power of 2	*/
					/* because of the index file creation	*/
					/* but it should not be too high as	*/
					/* this may cause inefficient writes	*/

	for (x = 0; x < rbufct; x++) {
		z = malloc(size);
		if (z == NULL) {
			fprintf(stderr, "\nerror reserving file buffer\n");
			rbuf[x].valid = 0;
			return;
		}
		rbuf[x].base = z;
		rbuf[x].valid = rbmagic;
		rbuf[x].fhandle = -1;
		rbuf[x].rw = (test == 0);
		rbuf[x].changed = 0;
		rbuf[x].size = size;
		rbuf[x].filled = 0;
		rbuf[x].fstart = -1;
		rbuf[x].fwstart = -1;
		rbuf[x].startsample = -1;
	}
}


static void flush_rbuf(int x)
{
	if (rbuf[x].valid != rbmagic)
		return;
	
	if (rbuf[x].rw
		&& (rbuf[x].changed || (rbuf[x].fstart != rbuf[x].fwstart))
		&& rbuf[x].filled > 0
		&& rbuf[x].fwstart >= 0
		&& rbuf[x].fhandle >= 0) {

		if (lseek(rbuf[x].fhandle, rbuf[x].fwstart, SEEK_SET) == rbuf[x].fwstart) {
				write(rbuf[x].fhandle, rbuf[x].base, rbuf[x].filled);
		}
		nowfpos = -1;
	}
	rbuf[x].changed = 0;
#ifdef with_index
	if (really_create_index)
		write_indexfile(rbuf[x].startsample, rbuf[x].base, rbuf[x].filled);
#endif
}

static void empty_rbufs(void)
{
	int x;

	for (x = 0; x < rbufct; x++) {
		if (rbuf[x].valid == rbmagic) {
			flush_rbuf(x);
			rbuf[x].filled = 0;
			rbuf[x].fstart = -1;
			rbuf[x].fwstart = -1;
			rbuf[x].fhandle = -1;
			rbuf[x].startsample = -1;
		}
	}
}

static void exit_rbuf(void)
{
	int x;

	empty_rbufs();

	for (x = 0; x < rbufct; x++) {
		if (rbuf[x].valid == rbmagic) {
			free(rbuf[x].base);
			rbuf[x].valid = 0;
		}
	}
}

static int fill_rbuf(int x, int fhandle, int fstart, int startsample)
{
	int ct;

	if (x < 0 || rbuf[x].valid != rbmagic)
		return(-10);

	flush_rbuf(x);

	if (fhandle >= 0 && fstart >= 0) {
		if (lseek(fhandle, fstart, SEEK_SET) == fstart) {
			if ((ct = read(fhandle, rbuf[x].base, rbuf[x].size)) >= 0) {
				rbuf[x].fhandle = fhandle;
				rbuf[x].filled = ct;
				rbuf[x].changed = 0;
				rbuf[x].fstart = fstart;
				rbuf[x].fwstart = fstart - leadoffs;
				rbuf[x].startsample = startsample;
				nowfpos = fstart+ct;
				return(ct);
			}
		}
		nowfpos = -1;
	}

	rbuf[x].filled = 0;
	rbuf[x].changed = 0;
	rbuf[x].fhandle = -1;
	rbuf[x].fstart = -1;
	rbuf[x].fwstart = -1;
	rbuf[x].startsample = -1;
	return(-10);
}

static int rbread(int handle, char *buffer, int size, int seekpos, int startsample)
{
	int ct;
	int x;

	x = find_rbuf(handle, seekpos, size);

	if (x >= 0) {
		memcpy(buffer, rbuf[x].base+(seekpos-rbuf[x].fstart), size);
		return(size);
	}

	x = assign_rrbuf();

	if (x < 0)
		return(-1);

	if ((ct = fill_rbuf(x, handle, seekpos, startsample)) < 0)
		return(ct);

	x = find_rbuf(handle, seekpos, size);

	if (x >= 0) {
		memcpy(buffer, rbuf[x].base+(seekpos-rbuf[x].fstart), size);
		return(size);
	}
	return(-2);
}

static int rbwrite(int handle, char *buffer, int size, int seekpos)
{
	int x;

	x = find_rbuf(handle, seekpos, size);

	if (x >= 0)	{
		memcpy(rbuf[x].base+(seekpos - rbuf[x].fstart), buffer, size);
		if (!test) rbuf[x].changed = 1;
		return(size);
	}

	/* flush sample if we have no buffer filled with that block		*/
	/* that should not happen with this program structure, but anyway	*/
	/* (it does not happen)							*/

	if (!test) {
	
		nothit++;
		
		if (nowfpos != seekpos) {
			if (lseek(handle, seekpos - leadoffs, SEEK_SET) != seekpos - leadoffs) {
				nowfpos = -1;
				return(-2);
			}
			nowfpos = seekpos - leadoffs;
		}

		if (write(handle, buffer, size) != size) {
			nowfpos = -1;
			return(-3);
		}
		nowfpos += size;
	}
	return(size);
}


/* read one sample at a given position	*/

static int read_sample(int handle, int foffset, int sampnr, Sample16Stereo *sample)
{
	int seekpos, truesample;

	truesample = sampnr - 1;
	seekpos = (truesample * sizeof(Sample16Stereo)) + foffset;
	if (rbread(handle, (char *)sample, sizeof(Sample16Stereo), seekpos, truesample) == sizeof(Sample16Stereo)) {
#ifdef B_ENDIAN
		swap_sample(sample);
#endif
		return(0);
	}
	return(-3);
}

/* write one sample at a given position	*/

static int write_sample(int handle, int foffset, int sampnr, Sample16Stereo *sample)
{
	int seekpos;

#ifdef B_ENDIAN
	swap_sample(sample);
#endif
	seekpos = ((sampnr - 1) * sizeof(Sample16Stereo)) + foffset;
	if (rbwrite(handle, (char *)sample, sizeof(Sample16Stereo), seekpos) == sizeof(Sample16Stereo)) {
		return(0);
	}
	return(-3);
}

/* read sample(s) RAW (without buffering) at a given position	*/
/* assuming that the read record is not yet buffered in any of	*/
/* the buffers or that they don't differ with disk content	*/
/* (disk = memory buffers)					*/

static int read_sample_raw(int handle, int foffset, int sampnr, Sample16Stereo *sample, int samples)
{
	int seekpos;
#ifdef B_ENDIAN
	int x;
#endif

	seekpos = ((sampnr - 1) * sizeof(Sample16Stereo)) + foffset;

	if (nowfpos != seekpos) {
		if (lseek(handle, seekpos, SEEK_SET) != seekpos) {
			nowfpos = -1;
			return(-2);
		}
		nowfpos = seekpos;
	}

	if (read(handle, (char *)sample, sizeof(Sample16Stereo)*samples) == sizeof(Sample16Stereo)*samples) {
#ifdef B_ENDIAN
		for (x = 0; x < samples; x++)
			swap_sample(sample++);
#endif
		return(0);
	}
	return(-3);
}

/* open the wave file	*/

static int open_wave(char *name)
{
	int k = -1;
	
#ifdef macos
	if (test)
		k = open(name, O_RDONLY);
	else
		k = open(name, O_RDWR);
#endif
#ifdef windows
	if (test)
		k = open(name, O_RDONLY+O_BINARY+O_RANDOM);
	else
		k = open(name, O_RDWR+O_BINARY+O_RANDOM);
#endif
#ifdef unix
	if (test)
		k = open(name, O_RDONLY, 0);
	else
		k = open(name, O_RDWR, 0);
#endif

	if (k >= 0) init_rbuf(-1);
	return k;
}

/* close the wave file	*/

static void close_wave(int k)
{
	if (k >= 0)	{
		exit_rbuf();
		close(k);	
	}
}

static int check_for_leadsilence(int handle, register int foffset, register int samples)
{
	Sample16Stereo sample;
	register int count = 0;
	Sample16Stereo *buf, *s1 = NULL;
	int bufsize, endsample, bufsamples;

	if (samples == 0) return 0;

	bufsamples = 50000;
	if (bufsamples > samples) bufsamples = samples;
	bufsize = bufsamples * sizeof(Sample16Stereo);
	buf = malloc(bufsize);

	if (buf == NULL) {

		do {
			count++;
			if (read_sample_raw(handle, foffset, count, &sample, 1) < 0) {
				fprintf(stderr, "\nRead error at sample %d\n", count);
				return 0;
			}
		} while (count < samples && abs(sample.chanA) <= max_zero && abs(sample.chanB) <= max_zero);
	}
	else {
		endsample = -1; /* flag */
		do {
			count++;
			if (count >= endsample) {
				endsample = (count + bufsamples) - 1;
				if (endsample > samples) endsample = samples;	
				if (read_sample_raw(handle, foffset, count, buf, (endsample-count)+1) < 0) {
					fprintf(stderr, "\nRead error at sample %d\n", count);
					return 0;
				}
				s1 = buf;
			} else s1++;
		} while (count < samples && abs(s1->chanA) <= max_zero && abs(s1->chanB) <= max_zero);
		free(buf);
	}

	return --count;
}

static int check_for_trailsilence(int handle, register int foffset, register int samples)
{
	Sample16Stereo sample;
	register int count;
	Sample16Stereo *buf, *s1 = NULL;
	int bufsize, startsample, bufsamples;

	if (samples == 0) return 0;

	bufsamples = 50000;
	if (bufsamples > samples) bufsamples = samples;
	bufsize = bufsamples * sizeof(Sample16Stereo);
	buf = malloc(bufsize);

	if (buf == NULL) {

		count = samples + 1;
		do {
			count--;
			if (read_sample_raw(handle, foffset, count, &sample, 1) < 0) {
				fprintf(stderr, "\nRead error at sample %d\n", count);
				return 0;
			}
		} while (count > 1 && abs(sample.chanA) <= max_zero && abs(sample.chanB) <= max_zero);
	}
	else {
		startsample = samples+10; /* flag */
		count = samples + 1;		
		do {
			count--;
			if (count < startsample) {
				startsample = (count - bufsamples) + 1;
				if (startsample < 1) startsample = 1;	
				if (read_sample_raw(handle, foffset, startsample, buf, (count-startsample)+1) < 0) {
					fprintf(stderr, "\nRead error at sample %d\n", startsample);
					return 0;
				}
				s1 = &buf[count-startsample];
			} else s1--;
		} while (count > 1 && abs(s1->chanA) <= max_zero && abs(s1->chanB) <= max_zero);
		free(buf);
	}

	return (samples-count);
}


/****************************************************************************************/
/* here starts the work we want to do...						*/
/*											*/
#define maxdeltas 150				/* our window on the wave file		*/
#define repeatblock (maxdeltas / 2)		/* when stepping back, do it x/2	*/
#define maxmultiplier 2				/* max new offset between two samples	*/
#define mincordelta 150				/* correct only if new sample value >	*/
/*											*/
/****************************************************************************************/

/* returns the maximum and average value of array delta	*/

static inline int find_moffs(register int delta[], int *mwoffs)
{
	register int mdoffs = 0;
	register int x, d;
	register int tmpmwoffs = 0;

	for (x = 0; x < maxdeltas; x++) {
		d = delta[x];
		tmpmwoffs += d;
		if (mdoffs < d) mdoffs = d;
	}
	if (tmpmwoffs < 5) tmpmwoffs = 5;
	*mwoffs = tmpmwoffs;
	if (mdoffs < 5) mdoffs = 5;
	return(mdoffs);
}

/* tries to calculate the new maximum and average value of array delta	*/
/* without stepping through all values again (speed)			*/

static inline void calc_newoffs(int delta[], register int olddelta, register int newdelta,
						 int *mdoffs, int *mwoffs)
{
	register int newoffs;

	newoffs = *mdoffs;
	if (newdelta >= newoffs) {
		newoffs = newdelta;
	} else if (olddelta >= newoffs) {
		*mdoffs = find_moffs(delta, mwoffs);
		return;
	}
	if (newoffs < 5) newoffs = 5;
	*mdoffs = newoffs;

	newoffs = (*mwoffs - olddelta) + newdelta;
	if (newoffs < 5) newoffs = 5;
	*mwoffs = newoffs;
}

/* calculates the maximum allowed offset of two samples		*/

static inline int calc_maxdiff(register int mdoffs, register int mwoffs)
{
	register int ret;

	ret = mdoffs * maxmultiplier;
	if (ret > limitdiff) ret = limitdiff;
	return(ret);
}


/* this is the function that checks the offset between two samples	*/

#define check_diff(max, sample, last, doffs) ((doffs = abs(sample - last)) > max)


/* pointer struct for nested rechecks of interpolated samples	*/

typedef struct rechecklisttype {
	int start;
	int errsample;
	struct rechecklisttype *next;
} rechecklisttype;

/* checks the last <repeatblock> samples for incorrectly adjusted samples	*/
/* this is important as we could not foresee the future while stepping		*/
/* forward in a first pass													*/

static int recheck_diff(int handle, int foffset, 
			int count, register int span,
			int deltarow, register short save[],
			register short cur[], short chg[], int delta[],
			rechecklisttype *rechecklist, int A)
{
	register int x;
	int doffs;
	int ret, hit, locdeltarow, ok;
	int change;
	int mdoffs;
	int mwoffs;
	int max;
	int olddelta;
	int sampnr;
	register Sample16Stereo *sample;
	Sample16Stereo samparr[repeatblock];
	int sampchg[repeatblock];
	rechecklisttype *hpr;

	mdoffs = find_moffs(delta, &mwoffs);
	max = calc_maxdiff(mdoffs, mwoffs);
	ret = 0;

	sampnr = count-span;
	for (x = 0; x < span; x++) {
		if (read_sample(handle, foffset, sampnr+x, &samparr[x]) < 0) {
			fprintf(stderr, "\nRead error at sample %d\n", sampnr+x);
			return(ret);
		}
		sampchg[x] = 0;
	}

	do {
		change = 0;
		for (x = 0; x < span; x++) {

#ifdef development
			if (develop == 3) {
				samparr[x].chanB = max;
				sampchg[x] = 1;
			}
#endif
			if (chg[x+1]) {
				hit = 0;

				ok = check_diff(max, save[x+1], cur[x], doffs);
				if (!ok) {

					locdeltarow = deltarow - (span - x);
					if (locdeltarow < 0) locdeltarow = maxdeltas + locdeltarow;
					olddelta = delta[locdeltarow];
					delta[locdeltarow] = doffs;
					calc_newoffs(delta, olddelta, doffs, &mdoffs, &mwoffs);
					max = calc_maxdiff(mdoffs, mwoffs);
			
					sample = &samparr[x];
					if (A) sample->chanA = save[x+1];
					else sample->chanB = save[x+1];

#ifdef development
					if (develop > 0 && develop < 3) {
						if (A) sample->chanB = 300;
						else sample->chanA = 300;
					}
#endif
		
					sampchg[x] = 1;
					cur[x+1] = save[x+1];
					chg[x+1] = 0;

					/* recalculate offset to next sample */

					if (x < span) {
						doffs = abs(cur[x+2] - cur[x+1]);

						locdeltarow = deltarow - (span - (x+1));
						if (locdeltarow < 0) locdeltarow = maxdeltas + locdeltarow;
						olddelta = delta[locdeltarow];
						delta[locdeltarow] = doffs;
						calc_newoffs(delta, olddelta, doffs, &mdoffs, &mwoffs);
						max = calc_maxdiff(mdoffs, mwoffs);
					}
					
					sampnr = (count-span) + x;
					hpr = rechecklist;
					while (hpr != NULL && hpr->errsample < sampnr) hpr = hpr->next;
					if (hpr != NULL && hpr->errsample == sampnr) {
						hpr->start = 0;
					}
					
					change++;
					ret++;

				}
			}
		}
	} while (change);

	sampnr = count-span;
	for (x = 0; x < span; x++) {
		if (sampchg[x]) {
			if (write_sample(handle, foffset, sampnr+x, &samparr[x]) < 0) {
				fprintf(stderr, "\nWrite error at sample %d\n", sampnr+x);
				return(ret);
			}
		}
	}

	return(ret);
}


/* this is the main function for checking and adjusting samples		*/
/* in a way, it does only pass 1 of the checking, in a second		*/
/* pass, all changed samples are checked again in recheck_diff()	*/

static void work(int handle, int foffset, int samples, FormatChunk fmt)
{
	Sample16Stereo sample, last, next, save;
	int recheckA, recheckB;
	register int count;
	int npos;
	int steps, nstep;
	int changes = 0;
	int locchang;
	int deltaA[maxdeltas];
	int deltaB[maxdeltas];
	short curA[repeatblock+1];
	short curB[repeatblock+1];
	short saveA[repeatblock+1];
	short saveB[repeatblock+1];
	short chgA[repeatblock+1];
	short chgB[repeatblock+1];
	int recheckArow = 0;
	int recheckBrow = 0;
	short sampval;
	short ct = 0;
	register int doffsA, doffsB, doA, doB, maxA, maxB;
	int mdoffsA, mdoffsB;
	int mwoffsA, mwoffsB;
	int deltarow = 0;
	int x, y, olddelta;
	int have_next = 0;
	int cornextstep = 0;
	rechecklisttype *rechecklistA;
	rechecklisttype *rechecklistB;
	rechecklisttype *hpr, *hpr2;
#ifdef development
	int prozf;
	char prozpres[20];
#endif


	rechecklistA = NULL;
	rechecklistB = NULL;
	steps = samples / 79; /* needed for the status display	*/
	nstep = steps;

	for (x = 0; x < maxdeltas; x++) {
		deltaA[x] = 5;
		deltaB[x] = 5;
	}
	mdoffsA = 5;
	mdoffsB = 5;
	mwoffsA = 0;
	mwoffsB = 0;
	maxA = calc_maxdiff(mdoffsA, mwoffsA);
	maxB = calc_maxdiff(mdoffsB, mwoffsB);

	if (!quiet) printf("\n0......10......20......30......40......50......60......70......80......90....100\n");

	locchang = 0;
	recheckA = 0;
	recheckB = 0;
	count = 1;

	if (!do_declick) {	/* we only want to create an index file	*/
		do {
			/* display of progress bar */

			if (count == nstep) {
				if (!quiet) {
					printf("*");
#ifdef unix
					fflush(stdout);
#endif
				}
				nstep += steps;
				if (nstep <= count) nstep = count + 1;
			}

			/* get next sample */

			if (read_sample(handle, foffset, count, &sample) < 0) {
				fprintf(stderr, "\nRead error at sample %d\n", count);
				return;
			}
			count++;
		} while (count <= samples);
		empty_rbufs();
		if (!quiet) printf("*\n");
		return;
	}

	/* step through all samples and check for clicks	*/

	do {

		if (count == recheckA) { /* start backward checking of channel A */
			x = recheck_diff(handle, foffset, count, recheckArow, deltarow,
					 saveA, curA, chgA, deltaA, rechecklistA, 1);
			if (x > 0) { /* if anything got changed we have to rebuild the offsets */
				mdoffsA = find_moffs(deltaA, &mwoffsA);
				maxA = calc_maxdiff(mdoffsA, mwoffsA);
			}
			changes -= x;
			locchang -= x;
			recheckA = 0;

			/* some more rechecks in the queue ?	*/

			if (rechecklistA != NULL) {

				/* delete already corrected samples in the recheck list */
				hpr = rechecklistA;
				while (hpr != NULL && hpr->start == 0) {
					rechecklistA = hpr->next;
					free(hpr);
					hpr = rechecklistA;
				}

				/* readjust the queues for later recheck */
				if (hpr != NULL) {
					rechecklistA = rechecklistA->next;
					recheckArow = count - hpr->errsample;
					recheckA = hpr->start;
					y = repeatblock - recheckArow;
					for (x = y; x <= repeatblock; x++) {
						saveA[x-y] = saveA[x];
						curA[x-y] = curA[x];					
						chgA[x-y] = chgA[x];					
					}
					free(hpr);
				}
			}		
		}

		if (count == recheckB) { /* see channel A above */
			x = recheck_diff(handle, foffset, count, recheckBrow, deltarow,
					 saveB, curB, chgB, deltaB, rechecklistB, 0);
			if (x > 0) {
				mdoffsB = find_moffs(deltaB, &mwoffsB);
				maxB = calc_maxdiff(mdoffsB, mwoffsB);
			}
			changes -= x;
			locchang -= x;
			recheckB = 0;

			/* some more rechecks in the queue ?	*/

			if (rechecklistB != NULL) {
				hpr = rechecklistB;
				while (hpr != NULL && hpr->start == 0) {
					rechecklistB = hpr->next;
					free(hpr);
					hpr = rechecklistB;
				}
				if (hpr != NULL) {
					rechecklistB = rechecklistB->next;
					recheckBrow = count - hpr->errsample;
					recheckB = hpr->start;
					y = repeatblock - recheckBrow;
					for (x = y; x <= repeatblock; x++) {
						saveB[x-y] = saveB[x];
						curB[x-y] = curB[x];					
						chgB[x-y] = chgB[x];					
					}
					free(hpr);
				}
			}		
		}


		/* display of progress bar */

		if (count == nstep) {
			if (recheckA || recheckB) {
				if (recheckA > recheckB)
					nstep = recheckA;
				else
					nstep = recheckB;
				cornextstep += nstep - count;
			} else {
				if (!quiet) {
					if (locchang) printf("o");
					else printf("*");
#ifdef unix
					fflush(stdout);
#endif
				}
				locchang = 0;
				nstep += steps - cornextstep;
				if (nstep <= count) nstep = count + 1;
				cornextstep = 0;
			}
		}

		/* get next sample */

		if (have_next) {
			sample = next;
			have_next = 0;
		} else {
			if (read_sample(handle, foffset, count, &sample) < 0) {
				fprintf(stderr, "\nRead error at sample %d\n", count);
				return;
			}
		}

		save = sample;

		if (count > 1) {

/* do we have a pending recheck ? If yes, fill the corresponding queues (A and/or B)	*/

			if (recheckA) {
				recheckArow++;
				saveA[recheckArow] = sample.chanA;
				curA[recheckArow] = sample.chanA;
				chgA[recheckArow] = 0;
			}
			if (recheckB) {
				recheckBrow++;
				saveB[recheckBrow] = sample.chanB;
				curB[recheckBrow] = sample.chanB;
				chgB[recheckBrow] = 0;
			}

/* this is the main check sequence. Is there anything to do in pass 1? Either for channel A or B ?	*/

			doA = check_diff(maxA, sample.chanA, last.chanA, doffsA);
			doB = check_diff(maxB, sample.chanB, last.chanB, doffsB);

#ifdef development
			if (develop) {
				if (devchan == 2) doA = 0;
				else doB = 0;
			}
#endif

/* here starts the adjustment. Depending on doA or doB, samples are interpolated	*/
/* doA refers to stereo channel A, doB to channel B					*/

			if (doA || doB) {

				if (doA) {

					if (count < samples) {
						ct = 1;
						npos = count;
						do {
							npos++;
							ct++;
							if (read_sample(handle, foffset, npos, &next) < 0) {
								fprintf(stderr, "\nRead error at sample %d\n", npos);
								return;
							}
						} while (npos < samples && ct < 8
									&& abs(next.chanA - last.chanA) > ct*maxA);
						if (npos == count+1) have_next = 1; else have_next = 0;
					} else next = last;

					sampval = last.chanA + ((next.chanA - last.chanA) / ct); 				
					if (abs(sampval - sample.chanA) < mincordelta) doA = 0;
					else {
						hpr = malloc(sizeof(rechecklisttype));
						if (hpr == NULL) {
							fprintf(stderr, "\nError reserving memory\n");
							return;
						}
						hpr->next = NULL;
						hpr->start = count + repeatblock;
						if (hpr->start > samples) hpr->start = samples;
						hpr->errsample = count;
						if (rechecklistA == NULL) {
							rechecklistA = hpr;
						} else {
							hpr2 = rechecklistA;
							while (hpr2->next != NULL) hpr2 = hpr2->next;
							if (hpr2->start == hpr->start) { /* possible at end of file */
								free(hpr);
							} else {
								hpr2->next = hpr;
							}
						}

						if (!recheckA) {
							hpr2 = rechecklistA;
							rechecklistA = rechecklistA->next;
							recheckA = hpr2->start;
							free(hpr2);
							saveA[0] = last.chanA;
							curA[0] = last.chanA;
							recheckArow = 1;
						}

						saveA[recheckArow] = sample.chanA;
						sample.chanA = sampval;
						curA[recheckArow] = sampval;
						chgA[recheckArow] = 1;
						doffsA = abs(sampval - last.chanA);
					}
				}

				if (doB) {

					if (count < samples) {
						ct = 1;
						npos = count;
						do {
							npos++;
							ct++;
							if (read_sample(handle, foffset, npos, &next) < 0) {
								fprintf(stderr, "\nRead error at sample %d\n", npos);
								return;
							}
						} while (npos < samples && ct < 8
									&& abs(next.chanB - last.chanB) > ct*maxB);
						if (npos == count+1) have_next = 1; else have_next = 0;
					} else next = last;

					sampval = last.chanB + ((next.chanB - last.chanB) / ct); 				
					if (abs(sampval - sample.chanB) < mincordelta) doB = 0;
					else {
						hpr = malloc(sizeof(rechecklisttype));
						if (hpr == NULL) {
							fprintf(stderr, "\nError reserving memory\n");
							return;
						}
						hpr->next = NULL;
						hpr->start = count + repeatblock;
						if (hpr->start > samples) hpr->start = samples;
						hpr->errsample = count;
						if (rechecklistB == NULL) {
							rechecklistB = hpr;
						} else {
							hpr2 = rechecklistB;
							while (hpr2->next != NULL) hpr2 = hpr2->next;
							if (hpr2->start == hpr->start) { /* possible at end of file */
								free(hpr);
							} else {
								hpr2->next = hpr;
							}
						}

						if (!recheckB) {
							hpr2 = rechecklistB;
							rechecklistB = rechecklistB->next;
							recheckB = hpr2->start;
							free(hpr2);
							saveB[0] = last.chanB;
							curB[0] = last.chanB;
							recheckBrow = 1;
						}

						saveB[recheckBrow] = sample.chanB;
						sample.chanB = sampval;
						curB[recheckBrow] = sampval;
						chgB[recheckBrow] = 1;
						doffsB = abs(sampval - last.chanB);
					}
				}


				if (doA || doB) {

#ifdef development
					if (!develop) {
#endif
						if (write_sample(handle, foffset, count, &sample) < 0) {
							fprintf(stderr, "\nWrite error at sample %d\n", count);
							return;
						}
#ifdef development
					}
#endif

					if (doA) {
						changes++;
						locchang++;
					}
					if (doB) {
						changes++;
						locchang++;
					}
				}
			}


#ifdef development
			if (develop) {
				if (devchan == 2) {
					if (doB) save.chanA = sample.chanB - save.chanB;
					else if (develop == 3) save.chanA = maxB;
					else save.chanA = 0;
					if (develop >= 2) save.chanB = sample.chanB;
				} else {
					if (doA) save.chanB = sample.chanA - save.chanA;
					else if (develop == 3) save.chanB = maxA;
					else save.chanB = 0;
					if (develop >= 2) save.chanA = sample.chanA;
				}
				if (write_sample(handle, foffset, count, &save) < 0) {
					fprintf(stderr, "\nWrite error at sample %d\n", count);
					return;
				}
			}
#endif

			olddelta = deltaA[deltarow];
			deltaA[deltarow] = doffsA;
			calc_newoffs(deltaA, olddelta, doffsA, &mdoffsA, &mwoffsA);
			maxA = calc_maxdiff(mdoffsA, mwoffsA);

			olddelta = deltaB[deltarow];
			deltaB[deltarow] = doffsB;
			calc_newoffs(deltaB, olddelta, doffsB, &mdoffsB, &mwoffsB);
			maxB = calc_maxdiff(mdoffsB, mwoffsB);

			deltarow++;
			if (deltarow >= maxdeltas) deltarow = 0;

		}
		last = sample;

		count++;
	} while (count <= samples);

	if (!quiet) {
		if (locchang) printf("o");
		else printf("*");

#ifdef development
		if (develop) y = 1; else y = 2;
		*prozpres = '\0';
		if (changes > 0) {
			prozf = 1;
			do {
				x = calc_prozent(changes*prozf, samples*y);
			} while (x < 10 && (prozf = prozf*10) < 10000000);
			if (prozf > 1) {
				strcat(prozpres, "0.");
				prozf = prozf/10;
				while ((prozf = prozf/10) >= 10) {
					strcat(prozpres, "0");
				}
			}

		} else x = 0;

		if (do_declick) {
			printf("\nClicks  : %d (%s%d%%)\n", changes, prozpres, x);
		}
#else
		if (do_declick)
			printf("\nRemoved : %d clicks\n", changes);
#endif
	}
	empty_rbufs(); /* flush and invalidate all rbufs, as we might do some 
			  modifications on the headers in filter() now  */
}



/* here we check for the amount of samples to be appended to the samples	*/
/* to match the sector size of a CD. if possible, the needed amount is taken	*/
/* from before cut trailing or leading silence.					*/

static int adjust_padding(int samples, int *lead, int *trail)
{
	int missing;
	
	missing = 588 - ((samples - *lead - *trail) % 588);
	if (missing == 588) missing = 0;

	if (missing > 0) {
		if (*trail > 0) {
			if (missing <= *trail) {
				*trail -= missing;
				missing = 0;
			}
			else {
				missing -= *trail;
				*trail = 0;
			} 
		}
	}

	if (missing > 0) {
		if (*lead > 0) {
			if (missing <= *lead) {
				*lead -= missing;
				missing = 0;
			}
			else {
				missing -= *lead;
				*lead = 0;
			}
		}
	}

	return (missing);
}


/* here we analyze the file format and skip over other chunks	*/
/* .wav files are so-called RIFF files, they could contain	*/
/* more medias and descriptors than only raw sample data	*/
/* after detecting the data chunk (the sampled data), work()	*/
/* is called							*/

static void filter(char *fname)
{
	int handle;
	int fsiz, chunkstart, riffsize, samples;
	char riff_id[4];
	chunk_hdr chunk, chunk2;
	int chunk_seek, tracklen, seekpos;
	int pad_samples = 0;
	FormatChunk fmtchunk;
	struct stat statbuf;
	char hs[100], hs2[20];

	if (stat(fname, &statbuf) != 0) {
		fprintf(stderr, "%s not found\n", fname);
		return;
	}

	handle = open_wave(fname);
	if (handle < 0) {
		fprintf(stderr, "Cannot open %s\n", fname);
		return;
	}

	if (!quiet) printf("\nFile    : %s\n", fname);

/* checking file size */

	fsiz = lseek(handle, 0, SEEK_END);
	lseek(handle, 0, SEEK_SET);

/* checking RIFF header */

	read(handle, riff_id, 4);
	if (strncmp(riff_id, "RIFF", 4)) {
#ifdef development
		fprintf(stderr, "%s is not a RIFF file\n", fname);
#else
		fprintf(stderr, "%s is not a WAVE file\n", fname);
#endif
		close_wave(handle);
		return;
	}

	read(handle, (char *)&riffsize, 4); /* we don´t use this value */

/* checking RIFF-WAVE header */

	read(handle, riff_id, 4);
	if (strncmp(riff_id, "WAVE", 4)) {
		fprintf(stderr, "%s is not a WAVE file\n", fname);
		close_wave(handle);
		return;
	}

/* chunk loop							*/
/* this program performs all operations on the open input file.	*/
/* that means that we simply have to step over all unknown	*/
/* or uninteresting RIFF chunks, such as playlists etc.		*/
/* it first looks for the format chunk, analyzes it and then	*/
/* looks for the data chunk, performing the required actions.	*/
/* if rough_cut is set, all chunks following the data chunk	*/
/* are cut.							*/

	fmtchunk.FormatTag = 0;
	chunkstart = 12;

	while (chunkstart < fsiz) {

		chunk_seek = lseek(handle, 0, SEEK_CUR);

		if (read(handle, (char *)&chunk, sizeof(chunk_hdr)) != sizeof(chunk_hdr)) {
#ifdef development
			fprintf(stderr, "premature end of file (looking for chunk header)\n");
#else
			fprintf(stderr, "invalid file format\n");
#endif
			close_wave(handle);
			return;
		}
#ifdef B_ENDIAN
		swap_chunk(&chunk);
#endif

		chunkstart += sizeof(chunk_hdr);

/* is the .len - entry invalid (doesn´t match the real file size) ? */

      	      	*hs2 = '\0';
		if (chunk.len > fsiz-chunkstart) {
		      	strcpy(hs2, "<-fixed");
			chunk.len = fsiz-chunkstart;
			if (!test) {
				if (lseek(handle, chunkstart-sizeof(chunk_hdr), SEEK_SET) >= 0) {
#ifdef B_ENDIAN
					swap_chunk(&chunk);
#endif
					write(handle, (char *)&chunk, sizeof(chunk_hdr));
#ifdef B_ENDIAN
					swap_chunk(&chunk);
#endif
				}
				lseek(handle, chunkstart, SEEK_SET);	
			}
		}

		strncpy(hs, chunk.id, 4);
		hs[4] = '\0';
#ifdef development
		if (!quiet) printf("chunk   : %s (%d bytes%s)", hs, chunk.len, hs2);
#endif

/* found the format chunk ?	*/

		if (!strcmp(hs, "fmt ") && chunk.len >= sizeof(FormatChunk)) {

			if (read(handle, (char *)&fmtchunk, sizeof(FormatChunk)) != sizeof(FormatChunk)) {
#ifdef development
				fprintf(stderr, "file error reading header\n");
#else
				fprintf(stderr, "invalid file format\n");
#endif
				close_wave(handle);
				return;
			}
#ifdef B_ENDIAN
			swap_fmtchunk(&fmtchunk);
#endif
#ifdef development
			if (!quiet) printf(" - Format:%d  Channels:%d  Bits:%d  Samples/sec:%d\n",
						fmtchunk.FormatTag, fmtchunk.Channels, fmtchunk.BitsPerSample,
						fmtchunk.SamplesPerSec);
#endif

		}
		
/* found the data chunk ?	*/

		else if (!strcmp(hs, "data") && chunk.len >= 0) {
		
			samples = chunk.len / fmtchunk.BlockAlign;
#ifdef development
			if (!quiet) printf(" - Samples:%d  Time:%d sec.", 
						samples, samples / fmtchunk.SamplesPerSec);
#endif
			if (fmtchunk.FormatTag != 1 || fmtchunk.BitsPerSample != 16
				|| fmtchunk.Channels != 2 || fmtchunk.BlockAlign != 4
				|| fmtchunk.SamplesPerSec < 1000) {
				fprintf(stderr, " - incompatible wave format\n");
			}


/* now the required action on the wave data ...	*/

			else {
#ifdef development
				if (!quiet) printf("\n");
				
#endif
				pad_samples = 0;
				if (skip_lzeroes || skip_tzeroes) {

					max_lskip = max_lskip_sec * fmtchunk.SamplesPerSec;
					max_tskip = max_tskip_sec * fmtchunk.SamplesPerSec;

					lead_silence = check_for_leadsilence(handle, chunkstart, samples);

					if (last_ended_silently == 0 && lead_silence < 3)
						if (!quiet)
							printf("WARNING : this track is possibly linked with the last!\n");

					trail_silence = check_for_trailsilence(handle, chunkstart, samples);

					if (!quiet)
						printf("Zero    : %d lead samples, %d trail samples\n",
										lead_silence, trail_silence);

					if (skip_lzeroes) {
						if (lead_silence > max_lskip) lead_silence = max_lskip;
					 } else {
						lead_silence = 0;
					}

					if (skip_tzeroes) {
						if (trail_silence < 3) last_ended_silently = 0;
						else last_ended_silently = 1;
						if (trail_silence > max_tskip) trail_silence = max_tskip;
					} else {
						trail_silence = 0;
						last_ended_silently = 1;
					}
					
					if (padding) pad_samples = adjust_padding(samples, &lead_silence,
											&trail_silence);

					if (!quiet)
						printf("Skipped : %d lead samples, %d trail samples\n",
										lead_silence, trail_silence);

					leadoffs = lead_silence*fmtchunk.BlockAlign;

				} else {

					lead_silence = 0;
					trail_silence = 0;
					last_ended_silently = 1;
					leadoffs = 0;
					if (padding) pad_samples = adjust_padding(samples, &lead_silence,
											&trail_silence);
				}
				
				if (pad_samples) {
					if (!quiet)
						printf("sorry   : would have to add %d samples for padding up, but can't\n", pad_samples);
					else
						fprintf(stderr, "sorry   : would have to add %d samples for padding up, but can't\n", pad_samples);
					pad_samples = 0;
				}
				
                                if (create_index || do_declick || lead_silence > 0) {
#ifdef with_index
					if (create_index)
						create_indexfile(fname, samples-lead_silence-trail_silence, pad_samples);
#endif
                                	work(	handle,
						chunkstart+leadoffs,
						samples-lead_silence-trail_silence,
						fmtchunk	);
#ifdef with_index
	                                if (create_index)
						close_indexfile(0);
#endif
				}
                                
/* if there are some skipped samples, or rough_cut is set, or some samples need padded, adjust the chunk header	*/

				if ((rough_cut || (lead_silence + trail_silence + pad_samples > 0)) && !test) {
					chunk2 = chunk;
					chunk2.len -= (lead_silence + trail_silence) * fmtchunk.BlockAlign;
					chunk2.len += pad_samples * fmtchunk.BlockAlign;
					tracklen = chunk2.len;
					if (lseek(handle, chunk_seek, SEEK_SET) != chunk_seek) {
						fprintf(stderr, "seek error\n");
						close_wave(handle);
						return;
					}
#ifdef B_ENDIAN
					swap_chunk(&chunk2);
#endif
					if (write(handle, (char *)&chunk2, sizeof(chunk_hdr)) != sizeof(chunk_hdr)) {
						fprintf(stderr, "write error\n");
						close_wave(handle);
						return;
					}

/* depending on the used c library, truncate the file or insert a dummy chunk header with the unused size */

					seekpos = chunk_seek + tracklen + sizeof(chunk_hdr);
					chunk2.len = ((lead_silence + trail_silence) * fmtchunk.BlockAlign) - sizeof(chunk_hdr);
#ifdef has_ftruncate
					if (rough_cut) {
						fsiz = seekpos + chunk2.len + sizeof(chunk_hdr);
					}

					if (copy_and_trunc(handle, &fsiz, seekpos, seekpos +
									chunk2.len + sizeof(chunk_hdr)) == 0)
					{

						if (lseek(handle, 4, SEEK_SET) != 4) { /* insert new filesize in RIFF header */
							fprintf(stderr, "seek error\n");
							close_wave(handle);
							return;
						}
#ifdef B_ENDIAN
						swap4(&fsiz);
#endif
						if (write(handle, (char *)&fsiz, 4) != 4) {
							fprintf(stderr, "write error\n");
							close_wave(handle);
							return;
						}
#ifdef B_ENDIAN
						swap4(&fsiz);
#endif
						chunk.len = tracklen;
						
					} else {
#endif
						strncpy(chunk2.id, "dumy", 4); /* fill wave with dummy chunk */
						if (lseek(handle, seekpos, SEEK_SET) != seekpos) {
							fprintf(stderr, "seek error\n");
							close_wave(handle);
							return;
						}
#ifdef B_ENDIAN
						swap_chunk(&chunk2);
#endif
						if (write(handle, (char *)&chunk2, sizeof(chunk_hdr)) != sizeof(chunk_hdr)) {
							fprintf(stderr, "write error\n");
							close_wave(handle);
							return;
						}
#ifdef has_ftruncate
					}
					
					if (rough_cut) {
						close_wave(handle);
						return;
					}
#endif
				}

			}
		}


/* any other chunk			*/

#ifdef development
		else if (!quiet) printf(" - skipped\n");
#endif
		chunkstart += chunk.len;

		if ((chunk.len < 0) || (lseek(handle, chunkstart, SEEK_SET) != chunkstart)) {
#ifdef development
			fprintf(stderr, "seek error (wrong header offset)\n");
#else
			fprintf(stderr, "invalid file format\n");
#endif
			close_wave(handle);
			return;
		}
	}

/* closing the wave file */

	close_wave(handle);
}


/* give some help	*/

static void show_help(char *ownname)
{
	char	hs[100];

	fprintf(stderr, "Dynamic Digital Declicker for wave files\n\n");
	
	sprintf(hs, "Usage: %s -d", ownname);
#ifdef development
	strcat(hs, "[n]");
#endif
	strcat(hs, "s[n]e[n]");
#ifdef with_index
	strcat(hs, "i");
#endif
	strcat(hs, "t");
#ifdef has_ftruncate
	strcat(hs, "c");
#endif
#ifdef development
	strcat(hs, "lr");
#endif
	strcat(hs, "v[n]pq <file> [file...]\n\n");
	fprintf(stderr, hs);

#ifdef development
	fprintf(stderr, " d[n] : declick samples. If n > 0 use analyzer mode, one channel for output of:\n");
	fprintf(stderr, "   1  :   correction samples, original signal on the other channel is unchanged\n");
	fprintf(stderr, "   2  :   correction samples, original signal on the other channel is corrected\n");
	fprintf(stderr, "   3  :   maximum threshold,  original signal on the other channel is unchanged\n");
	fprintf(stderr, " l    : if d1|d2|d3 correct/check  left channel (default)\n");
	fprintf(stderr, " r    : if d1|d2|d3 correct/check right channel\n");
#else
	fprintf(stderr, " d    : declick samples\n");
#endif
	fprintf(stderr, " s[n] : skip (delete) leading zero samples, skip max. [n] seconds\n");
	fprintf(stderr, " e[n] : skip (delete)  ending zero samples, skip max. [n] seconds\n");
#ifdef with_index
        fprintf(stderr, " i    : create index file (broadcast 2.1 file format)\n");
#endif
	fprintf(stderr, " t    : test mode, read-only access on files (no change of sample data)\n");
#ifdef has_ftruncate
	fprintf(stderr, " c    : cut input file to rough wave file (only format and data chunk)\n");
#endif
	fprintf(stderr, " v    : set correction threshold 0-9: 0 = default, 9 = most clicks\n");
	fprintf(stderr, " p    : pad samples to CD sector size (588 samples)\n");
	fprintf(stderr, " q    : quiet mode: no display output\n");
	fprintf(stderr, " file : file name of wave file(s)\n");
	fprintf(stderr, "\n");
}		 

static void display_options(void)
{
	if (test) printf("test mode         : on, opening input file read-only\n");
	printf("dynamic declicker : ");
	if (do_declick) {
		if (limits) printf("on, additionally skipping all deltas > %d\n", limitdiff);
		else printf("on\n");
		if (develop) {
			printf("analyzer mode     : on (%d), correct ", develop);
			if (devchan == 1) printf("left");
			else printf("right");
			printf(" channel\n");
		}
	}
	else printf("off\n");
	if (rough_cut) printf("cutting wave      : on, only format and data chunk in output\n");
	if (create_index) printf("index file        : on, creating broadcast style index file\n");
	if (skip_lzeroes || skip_tzeroes) {
		printf("skipping zeroes   : ");
		if (skip_lzeroes) {
			printf("lead ");
			if (max_lskip_sec < 10000)
				printf("(max. %d sec.) ", max_lskip_sec);
		}
		if (skip_tzeroes) {
			printf("trail ");
			if (max_tskip_sec < 10000)
				printf("(max. %d sec.) ", max_tskip_sec);
		}
		printf("\n");
	}
	if (padding) printf("padding           : on\n");
}

static int get_numval(char *p)
{
	int num = 0;
	int negation = 1;
	
	if (p == NULL) return (0);
	
	p++;
	if (*p == '-') {
		negation = -1;
		p++;
	}
	else if (*p == '+') {
		negation = 1;
		p++;
	}
	while (isdigit(*p)) {
		num = num*10 + ((int)*p - '0');
		p++;
	}
	return (num*negation);
}

int main(int argc, char *argv[])
{
	int ct;
	int help = 0;
	int temp;
	int has_options = 0;
	int hold_screen = 0;
	int first_filearg;
	char *p;
	char inputname[256], hs[100];
	char ownname[256];
	
#ifdef macos
	argc = ccommand(&argv);
#endif
	strcpy(ownname, argv[0]);
	del_path(ownname);

	first_filearg = 1;
	while (argc > first_filearg && *strcpy(hs, argv[first_filearg]) == '-') {
		first_filearg++;
		has_options				= 1;
		if (strchr(hs, 'h')) help		= 1;
		if ((p = strchr(hs, 's'))) {
			skip_lzeroes			= 1;
			temp = get_numval(p);
			if (temp > 0) {
				max_lskip_sec		= temp;
			}
		}
		if ((p = strchr(hs, 'e'))) {
			skip_tzeroes			= 1;
			temp = get_numval(p);
			if (temp > 0) {
				max_tskip_sec		= temp;
			}
		}
		if (strchr(hs, 't')) test		= 1;
#ifdef with_index
		if (strchr(hs, 'i')) create_index	= 1;
#endif
		if (strchr(hs, 'q')) quiet		= 1;
#ifdef has_ftruncate
		if (strchr(hs, 'c')) rough_cut		= 1;
#endif
		if (strchr(hs, 'p')) padding		= 1;
		if ((p = strchr(hs, 'v'))) {
			temp = get_numval(p);
			if (temp < 10 && temp > 0) {
				limits			= temp;
				limitdiff		= ((10-limits)*2)*1200;
			}
		}
		if ((p = strchr(hs, 'd'))) {
			do_declick			= 1;
#ifdef development
			temp = get_numval(p);
			if (temp > 0 && temp < 4) {
				develop 		= temp;
				if (devchan < 2)
					devchan		= 1;
			}
#endif
		}
#ifdef development
		if (develop) {
			if (strchr(hs, 'r'))
				devchan			= 2;
			if (strchr(hs, 'l'))
				devchan			= 1;
		}
#endif
	}
	
	/* if there are no options appended, use -d as default option	*/
	if (!has_options) {
		if (argc > first_filearg) {
			do_declick = 1;
		}
#ifdef windows
		hold_screen = 1;
#endif
	}

	if (!quiet) printf("\nDeClick v%s (c) Joachim Schurig 1999 jschurig@zedat.fu-berlin.de\n\n", vnum);

	if (help || (!skip_lzeroes && !skip_tzeroes && !create_index && !do_declick && !rough_cut)) {
		show_help(argv[0]);
		if (hold_screen) waitforreturn();
		return(0);
	}
	
	if (!quiet) display_options();

	if (argc > first_filearg) {
		for (ct = first_filearg; ct < argc; ct++) {
			strcpy(inputname, argv[ct]);
			filter(inputname);
		}
		printf("\n");
	}
	else show_help(argv[0]);
	
	if (nothit) fprintf(stderr, "\nHad %d samples that were missing in cache\n\n", nothit);

	if (hold_screen) waitforreturn();

	return(0);
}
