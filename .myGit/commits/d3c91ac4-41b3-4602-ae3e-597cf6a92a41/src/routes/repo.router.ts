import express from 'express';
import {CreateReposetory,
    fetchAllReposetory,
    fetchReposetoryById,
    fetchReposetoryByName,
    fetchReposetoryForCurrentUser,
    UpdateReposetoryById,
    DeleteReposetoryById,
    VisibilityToggle,
    FetchIssuesForRepo
} from '../controllers/RepoController.js'

const repoRouter = express.Router();

repoRouter.post('/create',CreateReposetory);
repoRouter.get('/all',fetchAllReposetory);
repoRouter.get('/id/:id',fetchReposetoryById);
repoRouter.get('/name/:name',fetchReposetoryByName);
repoRouter.get('/userId/:userId',fetchReposetoryForCurrentUser);
repoRouter.patch('/toggle/:id',VisibilityToggle);
repoRouter.put('/update/:id',UpdateReposetoryById);
repoRouter.delete('/delete/:id',DeleteReposetoryById);

export default repoRouter; 