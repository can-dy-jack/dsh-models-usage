const fs=require('fs');
const f=process.argv[2];
const fd=fs.openSync(f,'r');
const b=Buffer.alloc(16);fs.readSync(fd,b,0,16,0);
const pickleSize=b.readUInt32LE(4);
const jsonLen=b.readUInt32LE(12);
const hb=Buffer.alloc(jsonLen);fs.readSync(fd,hb,0,jsonLen,16);
const header=JSON.parse(hb.toString('utf8'));
const base=8+pickleSize;
const out=[];
(function walk(node,p){
  for(const [k,v] of Object.entries(node.files||{})){
    const np=p+'/'+k;
    if(v.files) walk(v,np); else out.push([np.replace(/^\//,''),v.size||0,v.offset!==undefined?base+Number(v.offset):null,v.unpacked?1:0]);
  }
})(header,'');
for(const r of out) console.log(r.join('\t'));
console.error('total='+out.length+' base='+base+' unpacked='+(header.files.dsh&&header.files.dsh.files?Object.keys(header.files.dsh.files).length:'?'));
