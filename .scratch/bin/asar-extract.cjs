const fs=require('fs'),path=require('path');
const f=process.argv[2], outDir=process.argv[3];
const prefixes=process.argv.slice(4);
const fd=fs.openSync(f,'r');
const b=Buffer.alloc(16);fs.readSync(fd,b,0,16,0);
const pickleSize=b.readUInt32LE(4), jsonLen=b.readUInt32LE(12);
const hb=Buffer.alloc(jsonLen);fs.readSync(fd,hb,0,jsonLen,16);
const header=JSON.parse(hb.toString('utf8'));
const base=8+pickleSize;
let n=0;
(function walk(node,p){
  for(const [k,v] of Object.entries(node.files||{})){
    const np=p+'/'+k;
    if(v.files) walk(v,np);
    else if(!v.unpacked && prefixes.some(x=>np.startsWith(x))){
      const dst=path.join(outDir,np);
      fs.mkdirSync(path.dirname(dst),{recursive:true});
      const buf=Buffer.alloc(v.size);fs.readSync(fd,buf,0,v.size,base+Number(v.offset));
      fs.writeFileSync(dst,buf);n++;
    }
  }
})(header,'');
console.log('extracted '+n);
