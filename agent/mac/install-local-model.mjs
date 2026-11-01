import {execFileSync} from 'node:child_process'
import {mkdirSync,writeFileSync} from 'node:fs'
import {homedir,userInfo} from 'node:os'
import {join} from 'node:path'
const executable=execFileSync('/usr/bin/which',['ollama'],{encoding:'utf8'}).trim()
if(!executable.startsWith('/'))throw new Error('Install Ollama first.')
const escape=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
const directory=join(homedir(),'Library','LaunchAgents')
const logs=join(homedir(),'.prime')
mkdirSync(directory,{recursive:true});mkdirSync(logs,{recursive:true,mode:0o700})
const plist=join(directory,'com.aadityjain.prime-local-model.plist')
writeFileSync(plist,`<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>Label</key><string>com.aadityjain.prime-local-model</string><key>ProgramArguments</key><array><string>${escape(executable)}</string><string>serve</string></array><key>EnvironmentVariables</key><dict><key>OLLAMA_NO_CLOUD</key><string>1</string><key>OLLAMA_HOST</key><string>127.0.0.1:11434</string></dict><key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>StandardOutPath</key><string>${escape(join(logs,'local-model.log'))}</string><key>StandardErrorPath</key><string>${escape(join(logs,'local-model.log'))}</string></dict></plist>`,{mode:0o600})
const domain=`gui/${userInfo().uid}`
try{execFileSync('/bin/launchctl',['bootout',domain,plist],{stdio:'ignore'})}catch{}
execFileSync('/bin/launchctl',['bootstrap',domain,plist])
console.log('PRIME local-only model service installed.')
