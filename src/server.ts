#!/usr/bin/env node
// this line tells the os that current file is a node exxecutable file. it is used to 
// execute the file from command line without explecitely running node.

import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import dotenv from 'dotenv';

import { initRepo } from "./controllers/init.js";
import { addRepo } from "./controllers/add.js";
import { commitRepo } from "./controllers/commit.js";
import { pullRepo } from "./controllers/pull.js";
import { pushRepo } from "./controllers/push.js";
import { revert } from "./controllers/revert.js";
import { getLogs } from "./controllers/log.js";
import { loginUser } from "./controllers/login.js";
import { statusRepo } from "./controllers/status.js";
import { diffRepo } from "./controllers/diff.js";
dotenv.config({ quiet: true });

yargs(hideBin(process.argv))
    .command('init', 'Initialize a new repository', {}, initRepo)
    .command('status', 'Show repository status', {}, statusRepo)
    .command(
        'diff [file]',
        'Show changes between commits and working tree',
        (yargs: any) => {
            return yargs.positional('file', {
                describe: 'File to diff',
                type: 'string'
            });
        },
        diffRepo
    )
    .command('add <files>', 'add a list of files', (yargs: any) => {
        return yargs.positional('files', {
            describe: 'The file will be added to the staging area',
            type: 'string'
        });
    }, addRepo)
    .command('commit <message>', 'commit files in staging area', (yargs: any) => {
        return yargs.positional('commit', {
            describe: 'The file will be commited',
            type: 'string'
        });
    }, commitRepo)
    .command('push', 'push changes', {}, pushRepo)
    .command('pull', 'pull changes', {}, pullRepo)
    .command(
        'revert <commitID>',
        'revert commited file',
        (yargs: any) => {
            return yargs
                .positional('commitID', {
                    describe: 'The commit hash or prefix to revert to',
                    type: 'string'
                })
                .option('force', {
                    alias: 'f',
                    type: 'boolean',
                    default: false,
                    describe: 'Discard uncommitted local changes and overwrite conflicting untracked files'
                })
                .option('snapshot', {
                    alias: 's',
                    type: 'boolean',
                    default: false,
                    describe: 'Automatically stage and create a backup commit of current uncommitted changes before reverting'
                });
        },
        (argv: any) => {
            revert(argv.commitID, { force: argv.force, snapshot: argv.snapshot });
        }
    )
    .command('logs', 'get commit logs', {}, getLogs)
    .command('login', 'login to snapkeep', {}, loginUser)
    .demandCommand(1, 'You need to specify a command')
    .help().argv;
