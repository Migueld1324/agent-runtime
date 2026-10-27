import {appendFile} from 'node:fs/promises';
import {join} from 'node:path';
import {Command} from '@langchain/langgraph';
import {createGraphV3} from '../../src/v3/graph.ts';
import {executeTool} from '../../src/v2/tools.ts';

const [dir,file,point]=process.argv.slice(2);
const config={configurable:{thread_id:'crash'},recursionLimit:35};
async function barrier() {
  process.stdout.write('READY\n');
  await new Promise<void>(()=>{setInterval(()=>{},1000);});
}
const runtime=await createGraphV3({checkpointPath:join(dir,'checkpoint.sqlite'),
  decide:async input=>{
    if(point==='hold-model')await barrier();
    return input.history.length ? {kind:'final',text:'Done'}
      : {kind:'tool',toolId:'filesystem.write',args:{fileName:file,content:'DURABLE'}};
  },
  execute:async(tool,args)=>{await appendFile(join(dir,'executions.log'),'execute\n');return executeTool(tool,args);},
  hook:async at=>{if(at===point)await barrier();},
});
if(point==='compete') {
  try {await runtime.recover(config);process.exitCode=3;}
  catch(error){process.stdout.write((error as Error).message);process.exitCode=2;}
} else {
  await runtime.invoke({runId:'crash',objective:'durable crash test',modelId:'mock',selectionReason:'test',scopeId:'poc-workspace',
    criterion:{id:'objective-file',kind:'workspace.file_content',version:1,fileName:file,expectedContent:'DURABLE'},
    observations:[],toolCount:0,status:'queued',result:''},config);
  const snap=await runtime.getState(config);
  await runtime.invoke(new Command({resume:{decision:'approve',runId:'crash',toolId:'filesystem.write',
    requestHash:snap.values.pendingHash,remember:'once'}}),config);
}
