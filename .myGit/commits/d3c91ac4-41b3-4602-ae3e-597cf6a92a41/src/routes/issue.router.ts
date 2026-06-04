import express from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import {CreateIssue,UpdateIssue,DeleteIssue,FetchAllIssue,FetchIssue} from '../controllers/IssueController.js'
import {
    FetchIssuesForRepo
} from '../controllers/RepoController.js'
const issueRouter = express.Router();


issueRouter.post('/create', requireAuth, CreateIssue);
issueRouter.get('/all',FetchAllIssue);
issueRouter.get('/repo/:id',FetchIssuesForRepo);
issueRouter.get('/:id',FetchIssue);
issueRouter.put('/update/:id', requireAuth, UpdateIssue);
issueRouter.delete('/delete/:id', requireAuth, DeleteIssue);

export default issueRouter; 