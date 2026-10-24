import { loginChatGPT, savedChatGPT, modelCatalog, useChatGPTModel, signOutChatGPT } from './chatgpt-auth.ts';
async function main(): Promise<void> {
  const [command,extra]=process.argv.slice(2);
  if (command==='login') return loginChatGPT();
  if (command==='logout') return signOutChatGPT();
  if (command==='status') {
    const c=await savedChatGPT();
    console.log(c ? `Connected: ${c.email||c.subject}\nModel: ${c.selected_model||'(not selected)'}\nPlan permission: yes\nToken: ${c.expires_at>Date.now()?'active':'refresh required'}` : 'Not connected. Run npm run auth:v3 -- login');
    return;
  }
  if (command==='models') {for (const item of await modelCatalog()) console.log(`${item.slug}\t${item.display_name}`);return;}
  if (command==='use' && extra) {await useChatGPTModel(extra);console.log(`Selected ChatGPT model: ${extra}`);return;}
  throw new Error('Usage: npm run auth:v3 -- login|status|models|use MODEL_SLUG|logout');
}
main().catch((e:unknown)=>{console.error(e instanceof Error ? e.message : String(e));process.exitCode=1;});
