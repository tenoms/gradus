import express from 'express';

export function createAppearanceRouter({ appearance, adminAuth }) {
  const router = express.Router();
  router.get('/api/appearance', async (_req, res) => res.json(await appearance.settings()));
  router.get('/api/admin/appearance', adminAuth.require, async (_req, res) => res.json(await appearance.settings()));
  router.put('/api/admin/appearance', adminAuth.require, async (req, res) => res.json(await appearance.update(req.body, req.studySession.user)));
  return router;
}
