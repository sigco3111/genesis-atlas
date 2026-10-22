// params injected: YEAR, MOFF, MCS
async function fetchRange(url,a,b){
  var want=b-a+1, lastErr='';
  for(var i=0;i<6;i++){
    try{
      var r = await fetch(url,{headers:{Range:'bytes='+a+'-'+b}});
      var buf = await r.arrayBuffer();
      if(buf.byteLength===want) return buf;
      lastErr='short '+buf.byteLength+'/'+want;
    }catch(e){ lastErr=e.message; }
    await new Promise(function(res){setTimeout(res,500);});
  }
  throw new Error('range fail '+a+' '+lastErr);
}
async function fetchFull(url){
  var lastErr='';
  for(var i=0;i<6;i++){
    try{ var r=await fetch(url); if(r.ok){ return await r.arrayBuffer(); } lastErr='http '+r.status; }
    catch(e){ lastErr=e.message; }
    await new Promise(function(res){setTimeout(res,500);});
  }
  throw new Error('full fail '+lastErr);
}
// parse outer LOCAL header to find method + data start
var lhbuf = await fetchRange('baseline.zip',MOFF,MOFF+4095);
var ldv = new DataView(lhbuf);
if(ldv.getUint32(0,true)!==0x04034b50) throw new Error('bad outer local sig');
var ometh = ldv.getUint16(8,true);
var onlen = ldv.getUint16(26,true), oelen = ldv.getUint16(28,true);
var DSTART = MOFF+30+onlen+oelen;
// fetch member data in 8MB chunks
var CH=8388608, parts=[];
for(var s=0;s<MCS;s+=CH){ parts.push(await fetchRange('baseline.zip',DSTART+s,Math.min(DSTART+s+CH-1,DSTART+MCS-1))); }
var mbuf = new Uint8Array(MCS); var off=0;
parts.forEach(function(pt){ mbuf.set(new Uint8Array(pt),off); off+=pt.byteLength; });
// province raster
var ibuf = await fetchFull('https://raw.githubusercontent.com/sigco3111/genesis-atlas/main/data/earth_prov.png');
var bmp = await createImageBitmap(new Blob([ibuf],{type:'image/png'}));
var cv = new OffscreenCanvas(1280,512);
var cx = cv.getContext('2d');
cx.drawImage(bmp,0,0);
var px = cx.getImageData(0,0,1280,512).data;
var prov = new Int32Array(1280*512);
for(var i=0;i<1280*512;i++){ prov[i]=(px[i*4]|(px[i*4+1]<<8))-1; }
// inflate outer only if deflated (method 8); stored (0) is already the inner zip
var inner;
if(ometh===0){ inner = mbuf.buffer; }
else{
  var ds1 = new DecompressionStream('deflate-raw');
  var s1 = new Blob([mbuf]).stream().pipeThrough(ds1);
  inner = await new Response(s1).arrayBuffer();
}
var iu=new Uint8Array(inner), idv=new DataView(inner);
var eocd=-1;
for(var j=iu.length-22;j>=0;j--){ if(iu[j]===0x50&&iu[j+1]===0x4b&&iu[j+2]===0x05&&iu[j+3]===0x06){eocd=j;break;} }
if(eocd<0) return 'NO INNER EOCD';
var cdoff=idv.getUint32(eocd+16,true), cdsz=idv.getUint32(eocd+12,true);
var p=cdoff, entry=null, names=[];
while(p < cdoff+cdsz-4){
  if(idv.getUint32(p,true)!==0x02014b50) break;
  var method=idv.getUint16(p+10,true);
  var csz=idv.getUint32(p+20,true), usz=idv.getUint32(p+24,true);
  var nlen=idv.getUint16(p+28,true), elen=idv.getUint16(p+30,true), clen=idv.getUint16(p+32,true);
  var lho=idv.getUint32(p+42,true);
  var name=new TextDecoder().decode(iu.subarray(p+46,p+46+nlen));
  names.push(name);
  if(/popc.*\.(asc|txt)$/i.test(name)) entry={m:method,cs:csz,us:usz,o:lho,n:name};
  p+=46+nlen+elen+clen;
}
if(!entry) return 'NO POPC in '+JSON.stringify(names);
var lh=entry.o;
if(idv.getUint32(lh,true)!==0x04034b50) return 'BAD LOCAL SIG';
var lnlen=idv.getUint16(lh+26,true), lelen=idv.getUint16(lh+28,true);
var dstart=lh+30+lnlen+lelen;
var comp=inner.slice(dstart, dstart+entry.cs);
var ds2 = new DecompressionStream('deflate-raw');
var s2 = new Blob([comp]).stream().pipeThrough(ds2);
var reader = s2.getReader();
var dec = new TextDecoder();
var buf2='';
var headerLines=0, ncols=0, nrows=0, xll=-180, yll=-90, cell=0.0833333333333, nodata=-9999;
var row=0;
var acc = new Float64Array(2048);
var total=0;
var totalAll=0;
var dropCoast=0;
var cntPos=0;
function processLine(line){
  line=line.trim();
  if(!line) return;
  if(headerLines<6){
    var m=line.match(/^\s*(\S+)\s+(-?[\d.eE+]+)/);
    if(m){
      var k=m[1].toLowerCase(), v=parseFloat(m[2]);
      if(k==='ncols'){ncols=v;headerLines++;}
      else if(k==='nrows'){nrows=v;headerLines++;}
      else if(k==='xllcorner'||k==='xllcenter'){xll=v;headerLines++;}
      else if(k==='yllcorner'||k==='yllcenter'){yll=v;headerLines++;}
      else if(k==='cellsize'){cell=v;headerLines++;}
      else if(k.indexOf('nodata')===0){nodata=v;headerLines++;}
    }
    return;
  }
  var latC = yll + (nrows-row-0.5)*cell;
  var y = Math.floor((84-latC)/0.28125);
  row++;
  if(y<0||y>=512) return;
  var parts=line.split(/\s+/);
  for(var c=0;c<parts.length;c++){
    var val=parseFloat(parts[c]);
    if(!(val>0)) continue;
    totalAll+=val; cntPos++;
    var lonC = xll + (c+0.5)*cell;
    var x = Math.floor((lonC+180)/0.28125);
    if(x<0||x>=1280) continue;
    var pid = prov[y*1280+x];
    if(pid>=0 && pid<2048){ acc[pid]+=val; total+=val; } else { dropCoast+=val; }
  }
}
while(true){
  var rd = await reader.read();
  if(rd.done){ if(buf2.trim()) processLine(buf2); break; }
  buf2 += dec.decode(rd.value,{stream:true});
  var idx;
  while((idx=buf2.indexOf('\n'))>=0){ processLine(buf2.slice(0,idx)); buf2=buf2.slice(idx+1); }
}
var out = new Uint8Array(acc.buffer);
var bin='';
for(var q=0;q<out.length;q+=8192){ bin+=String.fromCharCode.apply(null,out.subarray(q,q+8192)); }
return JSON.stringify({year:'YEAR',totalAll:Math.round(totalAll),dropCoast:Math.round(dropCoast),cntPos:cntPos,entry:entry.n,ncols:ncols,nrows:nrows,xll:xll,yll:yll,cell:cell,rows:row,total:Math.round(total),b64:btoa(bin)});
