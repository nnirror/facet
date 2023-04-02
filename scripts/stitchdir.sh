rm in.wav stitched.wav                                                                                                                            
ls *.wav | sort -n | while read l;
do                                                                                                                                                            
   if [ ! -f in.wav ]                                                                                                                                         
   then                                                                                                                                                       
      cp $l in.wav                                                                                                                                            
   else                                                                                                                                                       
      sox in.wav $l stitched.wav                                                                                                                                   
      cp stitched.wav in.wav                                                                                                                                       
   fi                                                                                                                                                         
   echo "$l"                                                                                                                                                  
done        
``
