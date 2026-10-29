import express from 'express';

export function createResourceRouter({resourceStore,resourceSync,identities,auth}) {
  const router=express.Router();
  const selector=req=>({platform:req.params.platform,sourceId:req.params.sourceId,key:req.params.key});
  router.get('/resource-sync',auth.require,async(_req,res)=>res.json(await resourceSync.status()));
  router.put('/resource-sync',auth.require,async(req,res)=>{
    const state=await resourceSync.updateSettings(req.body);
    await identities.audit(req.studySession.user,'resource_sync.updated','学习过程资源同步',state.settings.enabled?'开启访问时同步':'关闭访问时同步');
    res.json(state);
  });
  router.get('/resources',auth.require,async(req,res)=>res.json(await resourceStore.list(req.query)));
  router.get('/resources/:platform/:sourceId/:key',auth.require,async(req,res)=>res.json(await resourceStore.detail(selector(req))));
  router.patch('/resources/:platform/:sourceId/:key',auth.require,async(req,res)=>{
    const resource=await resourceStore.update({...selector(req),revision:req.body?.revision,response:req.body?.response});
    await identities.audit(req.studySession.user,'resource.updated',resource.title,`资源版本 ${resource.revision}`);
    res.json(resource);
  });
  router.post('/resources/:platform/:sourceId/:key/invalidate',auth.require,async(req,res)=>{
    const resource=await resourceStore.invalidate({...selector(req),revision:req.body?.revision});
    await identities.audit(req.studySession.user,'resource.invalidated',resource.title,'下次学习访问时重新读取小程序');
    res.json(resource);
  });
  router.delete('/resources/:platform/:sourceId/:key',auth.require,async(req,res)=>{
    const selected=selector(req),resource=await resourceStore.detail(selected);
    const result=await resourceStore.remove({...selected,revision:req.body?.revision});
    await identities.audit(req.studySession.user,'resource.deleted',resource.title,'删除资源缓存，保留个人学习记录');
    res.json(result);
  });
  return router;
}
