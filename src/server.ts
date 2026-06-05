#!/usr/bin/env node
// this line tells the os that current file is a node exxecutable file. it is used to 
// execute the file from command line without explecitely running node.

import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import express from "express";
import cors from 'cors';
import http, { METHODS } from 'http';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import {Server} from 'socket.io'
import cookieParser from "cookie-parser";

import { initRepo } from "./controllers/init.js";
import {addRepo} from "./controllers/add.js";
import {commitRepo} from "./controllers/commit.js";
import { pullRepo } from "./controllers/pull.js";
import { pushRepo } from "./controllers/push.js";
import { revert } from "./controllers/revert.js";
import bodyParser from "body-parser";
import mainRouter from "./routes/main.router.js";
import { getLogs } from "./controllers/log.js";
dotenv.config({ quiet: true });

getLogs();

yargs(hideBin(process.argv))
    .command('start', 'start the server', {}, startServer) 
    .command('init', 'Initialize a new repository', {}, initRepo)
    .command('add <files>', 'add a list of files', (yargs: any) => {
        return yargs.positional('files', {
        describe: 'The file will be added to the staging area',
        type: 'string'
        })
    },addRepo)
    .command('commit <message>', 'commit files in staging area', (yargs: any) => {
        return yargs.positional('commit', {
        describe: 'The file will be commited',
        type: 'string'
        })
    },commitRepo)
    .command('push', 'push changes', {}, pushRepo)
    .command('pull', 'pull changes', {}, pullRepo)
    .command(
        'revert <commitID>',
        'revert commited file',
        (yargs: any) => {
            return yargs.positional('commitID', {
            describe: 'The commited file will be reverted',
            type: 'string'
            })
        },
        (argv: any) => {
            revert(argv.commitID);   
        }
        )
        .command('logs','get commit logs',{},getLogs)
    .demandCommand(1, 'You need to specify a command')
    .help().argv;
    

    function  startServer(){
         const port = process.env.PORT||3000;
         const app = express();
         app.use(bodyParser.json());
         app.use(express.json());
         app.use(cookieParser());

         const mongourl = process.env.MONGO_URL!;
          mongoose.connect(mongourl)
         .then(()=>console.log("mongodb connected")).catch((err)=>console.error("error connecting to mongodb : ",err));

         app.use(cors(
            {origin:'http://localhost:5173',
                 methods: ['GET','POST','DELETE','PUT','PATCH'],
                credentials: true
            }
        ));
         app.use('/',mainRouter);
        
         
         let user = 'test';
         const httpServer =  http.createServer(app);
         const io = new Server(httpServer,
            {cors:{
                origin:'http://localhost:5173',
                methods: ['GET','POST'],
                credentials:true
            }}
         );

         io.on('connection',(socket)=>{
            socket.on('joinRoom',(userId)=>{
                 user = userId;
                console.log("======");
                console.log(user);
                console.log("======");
                socket.join(userId);
         })
        })

        const db = mongoose.connection;
        db.once('open',async()=>{
            console.log("CRUD operations called");
            //crud operations
        })

        httpServer.listen(3000,()=>{
            console.log(`app listening at port ${port}`)
        })
    }