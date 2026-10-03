const fs=require('fs');
const f=process.argv[2];
const pats=process.argv.slice(3).map(s=>Buffer.from(s));
const fd=fs.openSync(f,'r');
const st=fs.fstatSync(fd);
const buf=Buffer.alloc(st.size);
fs.readSync(fd,buf,0,st.size,0);
const pickleSize=buf.readUInt32LE(4), jsonLen=buf.readUInt32LE(12);
const header=JSON.parse(buf.subarray(16,16+jsonLen).toString('utf8'));
const base=8+pickleSize;
const ents=[];
(function walk(node,p){for(const [k,v] of Object.entries(node.files||{})){const np=p+'/'+k;if(v.files)walk(v,np);else if(!v.unpacked)ents.push([base+Number(v.offset||0),base+Number(v.offset||0)+v.size,np]);}})(header,'');
ents.sort((a,b)=>a[0]-b[0]);
const owner=(off)=>{let lo=0,hi=ents.length-1;while(lo<=hi){const m=(lo+hi)>>1;if(off<ents[m][0])hi=m-1;else if(off>=ents[m][1])lo=m+1;else return ents[m][2];}return null;};
for(const p of pats){
  const hits=new Map();
  let i=buf.indexOf(p);
  while(i!==-1){const o=owner(i);hits.set(o,(hits.get(o)||0)+1);i=buf.indexOf(p,i+1);}
  console.log('### '+p.toString());
  for(const [k,v] of [...hits].sort((a,b)=>b[1]-a[1])) console.log('  '+v+'\t'+k);
}
