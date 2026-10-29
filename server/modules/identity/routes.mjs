import express from 'express';

export function createRegistrationRouter({registration,adminAuth,learningAuth}) {
  const router=express.Router();
  router.get('/api/system/registration',async(req,res)=>res.json(await registration.publicSettings()));
  router.get('/api/admin/registration',adminAuth.require,async(req,res)=>res.json(await registration.settings()));
  router.put('/api/admin/registration',adminAuth.require,async(req,res)=>res.json(await registration.update(req.body,req.studySession.user)));
  router.post('/api/learning/auth/register',async(req,res)=>{
    const user=await registration.register(req.body);
    res.status(201).json(await learningAuth.save(req,res,user));
  });
  return router;
}
