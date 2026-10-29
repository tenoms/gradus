import express from 'express';

export function createPersonalSyncRouter({auth,personalSync}){
  const router=express.Router(),user=req=>req.studySession.user.id;
  router.use(auth.require);
  router.get('/',async(req,res)=>res.json(await personalSync.status(user(req))));
  router.put('/connection',async(req,res)=>res.json(await personalSync.saveConnection(user(req),req.body)));
  router.get('/accounts',async(req,res)=>res.json(await personalSync.accounts(user(req))));
  router.post('/binding',async(req,res)=>res.json(await personalSync.bind(user(req),req.body)));
  router.delete('/binding',async(req,res)=>res.json(await personalSync.detach(user(req))));
  router.put('/settings',async(req,res)=>{await personalSync.settings(user(req),req.body);res.json(await personalSync.status(user(req)));});
  router.post('/preview',async(req,res)=>res.json(await personalSync.preview(user(req),req.body)));
  router.post('/refresh',async(req,res)=>res.json(await personalSync.refresh(user(req),req.body)));
  router.get('/records',async(req,res)=>res.json(await personalSync.listRecords(user(req),req.query)));
  return router;
}
