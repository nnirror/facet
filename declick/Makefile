#######################################################################################
# Makefile for declick.c
# 
# comment or uncomment some of the following options:
#
#
# if your processor is of the intel family, endianess is Little
ENDIAN		= -DL_ENDIAN
# if your processor uses Big Endians:
# BTW not tested, don´t expect it works from scratch. Recently made some modifications
# that should ensure byte swapping is OK. But... not tested
#ENDIAN		= -DB_ENDIAN
#
#
#
# what kind of system?
SYS		= -Dunix
#SYS		= -Dmacos
#SYS		= -Dwindows
#
#
#
# does your C library provide ftruncate() ? it would be nice it would...
TRUNC		= -Dhas_ftruncate
#
#
#
# undefining "development" results in less options of the program, nothing else.
# especially the "analyzer mode", displaying corrections of samples in one of
# the stereo channels, is not available. better you let it defined.
DEV		= -Ddevelopment
#
#
#
# should the code include functions for creating broadcast v2.1 index files ?
IDX		= -Dwith_index
#
#
#
# if supported by your compiler, use function inline optimization (= O3 for gcc)
# -funsigned-char is not really important, as well as -fomit-frame-pointer
# the last one saves some space, but if you intend to debug the code with gdb, don´t
# define it (and you should uncomment the strip call in the "all" rule below).
COPTS		= -Wall -O3 -funsigned-char -fomit-frame-pointer
#
#
# end of configuration
########################################################################################



CDEFS		= $(ENDIAN) $(SYS) $(TRUNC) $(DEV) $(IDX)
CC		= gcc
CPP		= $(CC) -E
CFLAGS		= $(COPTS) $(CDEFS)
LD		= $(CC)
LDFLAGS		=
LIBS		=
DEFS		=

.c.o:
	$(CC) $(CFLAGS) -c $<

HDRS		=
OBJS		= declick.o 

SRCS		= declick.c

OTHERS          = Makefile README

default:	all

tgz:		
		@echo Creating declick.tgz
		@tar -cvzf declick.tgz $(SRCS) $(HDRS) $(OTHERS)

csource:	$(SRCS)

declick:	$(OBJS)
		$(CC) $(CFLAGS) $(OBJS) $(LIBS) -o declick;

clean:		
		rm -f  *.o *~ .*~ *.s .depend

install:
		@echo "copying declick to /usr/local/bin"
		@cp -a declick /usr/local/bin/
		
instclean:	clean
		rm -f declick tags

depend:		dep

dep:		
		ctags *.h *.c

all:		declick
		strip declick

allinst:	all
		rm -f  *.o *~ .*~ *.s .depend
		cp -a declick /usr/local/bin/
