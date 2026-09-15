import { getConfig } from './config.js';
import { createApp } from './app.js';
import { startScheduler } from './reminders.js';
const config=getConfig();
const context=await createApp(config);
const server=context.app.listen(config.port,config.production?'0.0.0.0':'127.0.0.1',()=>console.log(`Đỗ Gia đang chạy ở cổng ${config.port}.`));
const stopScheduler=startScheduler({...context,config});
function stop(){stopScheduler();server.close(()=>{context.db.close();process.exit(0);});}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
