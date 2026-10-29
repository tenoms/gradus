import express from 'express';

export function createAdminRouter({ service, identities, connections, configuration, operations, auth, accountPool, resourceSync }) {
  const router = express.Router();
  router.use('/auth', auth.router);
  router.use(auth.require);
  router.get('/overview', async (req,res) => {
    const value=await identities.overview(connections),resources=await resourceSync.status();
    value.platforms=value.platforms.map(platform=>({...platform,resourceCount:resources.resources.byPlatform[platform.id]||0}));
    res.json(value);
  });
  router.get('/operations', (req,res) => res.json({ ...operations.snapshot(), configurationRevision:configuration.publicConfig().revision }));
  router.get('/users', async (req,res) => res.json(await identities.userPage(req.query)));
  router.post('/users', async (req,res) => res.status(201).json({user:await identities.createUser(req.body,req.studySession.user)}));
  router.patch('/users/:id', async (req,res) => {
    const previous=await identities.user(req.params.id);
    const user=await identities.updateUser(req.params.id,req.body,req.studySession.user);
    const connection=connections.get(user.id);
    const currentRef=user.yyb.mode==='custom'?user.yyb.ref:user.yybRef;
    if (user.status!=='active' || previous?.yybRef!==user.yybRef || (connection && currentRef && connection.account.ref!==currentRef)) { connections.delete(user.id); await accountPool.release(user.id); }
    res.json({user});
  });
  router.post('/users/:id/password', async (req,res) => { await identities.resetPassword(req.params.id,req.body?.password,req.studySession.user); connections.delete(req.params.id); await accountPool.release(req.params.id); res.json({ok:true}); });
  router.get('/accounts', async (req,res) => {
    const assigned=new Map();
    for (const user of await identities.users()) if(user.yybRef) assigned.set(user.yybRef,[...(assigned.get(user.yybRef)||[]),{id:user.id,displayName:user.displayName}]);
    const accounts=await accountPool.directory();
    res.json({accounts:accounts.map(account=>{const refs=[account.ref,...(account.routes||[]).map(route=>route.serviceId==='default'?route.rawRef:`${route.serviceId}::${route.rawRef}`)],users=[...new Map(refs.flatMap(ref=>assigned.get(ref)||[]).map(user=>[user.id,user])).values()]; return {...account,assignedUsers:users,...(users.length?{assignedTo:users[0]}:{})};})});
  });
  router.get('/yyb-services',async(req,res)=>res.json(await accountPool.services.list()));
  router.post('/yyb-services',async(req,res)=>{const value=await accountPool.services.save(req.body);await identities.audit(req.studySession.user,'configuration.updated','系统 YYB 服务','新增资源访问服务');res.status(201).json(value);});
  router.patch('/yyb-services/:id',async(req,res)=>{const value=await accountPool.services.save(req.body,req.params.id);await identities.audit(req.studySession.user,'configuration.updated','系统 YYB 服务','更新资源访问服务');res.json(value);});
  router.delete('/yyb-services/:id',async(req,res)=>{const value=await accountPool.services.remove(req.params.id,req.body?.revision);await identities.audit(req.studySession.user,'configuration.updated','系统 YYB 服务','移除资源访问服务');res.json(value);});
  router.post('/yyb-services/:id/probe',async(req,res)=>res.json(await accountPool.services.probe(req.params.id)));
  router.get('/account-pool', async (req,res) => res.json(await accountPool.publicState()));
  router.put('/account-pool', async (req,res) => { const state=await accountPool.update(req.body); await identities.audit(req.studySession.user,'account_pool.updated','系统 YYB 账号池',`调度：${state.algorithm}；启用 ${state.enabledRefs.length} 个账号`); res.json(state); });
  router.get('/audit',async(req,res)=>res.json(await identities.auditPage(req.query)));
  router.get('/announcements',async(req,res)=>res.json(await identities.announcementPage(req.query)));
  router.post('/announcements',async(req,res)=>res.status(201).json({announcement:await identities.announce(req.body,req.studySession.user)}));
  router.delete('/announcements/:id',async(req,res)=>{await identities.deleteAnnouncement(req.params.id,req.studySession.user);res.json({ok:true});});
  router.get('/configuration',(req,res)=>res.json(configuration.publicConfig()));
  router.put('/configuration',async(req,res)=>{
    const previous=service.getConfig(),result=await configuration.update(req.body),current=service.getConfig();
    for(const connection of connections.values()) for(const name of result.affectedPlatforms) if(JSON.stringify(previous[name])!==JSON.stringify(current[name]) || (connection.yybMode||'system')==='system') connection.platforms[name]={connected:false,error:'平台配置已更新，请重新连接'};
    await identities.audit(req.studySession.user,'configuration.updated','平台集成',`版本 ${result.revision}；重新连接：${result.affectedPlatforms.join('、')||'无'}`);
    res.json(result);
  });
  router.post('/configuration/probe',async(req,res)=>{const selected=req.body?.ref?await accountPool.lookup(req.body.ref):null;const result=await service.probe({target:req.body?.target,ref:selected?.rawRef,yyb:selected?.yyb});await identities.audit(req.studySession.user,'configuration.probed','平台集成',`${result.target}：${result.ok?'通过':'失败'}`);res.json(result);});
  return router;
}
