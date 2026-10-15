import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>{process.env.DATABASE_URL??='postgres://test:test@localhost/test';return {expires:0,revoked:false,hash:''};});
vi.mock('../src/db.js',()=>{
 const query=async(sql:string,values:any[]=[])=>{
  if(sql.includes('FROM sessions s'))return {rows:!state.revoked&&state.expires>Date.now()&&values[0]===state.hash?[{session_id:'session',id:'user',organization_id:'org',username:'test',display_name:'Test',role:'execution_team',locale:'zh-CN',must_change_password:false,status:'active'}]:[],rowCount:1};
  if(sql.includes('SET last_seen_at'))state.expires=Date.now()+Number(values[1])*60000;
  if(sql.includes('SET revoked_at'))state.revoked=true;
  return {rows:[],rowCount:1};
 };return {pool:{query,connect:async()=>({query,release(){}})}};
});
import {loadSession,registerAuthRoutes,requireUser} from '../src/auth.js';
import {hashSessionToken} from '../src/security.js';
import {config} from '../src/config.js';
const app=Fastify();const token='test-only-session-token';
beforeAll(async()=>{await app.register(cookie);app.decorateRequest('currentUser',null);app.decorateRequest('sessionId',null);app.addHook('onRequest',loadSession);await registerAuthRoutes(app);app.get('/protected',async request=>({user:requireUser(request)}));app.setErrorHandler((error,_request,reply)=>reply.code((error as any).statusCode??500).send({error:(error as Error).message}));await app.ready();});
beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-14T12:00:00Z'));state.expires=Date.now()+config.SESSION_IDLE_MINUTES*60000;state.revoked=false;state.hash=hashSessionToken(token);});
afterAll(async()=>{vi.useRealTimers();await app.close();});
describe('sliding browser and database session',()=>{
 it('renews the browser cookie as well as the database on authenticated activity',async()=>{vi.setSystemTime(Date.now()+(config.SESSION_IDLE_MINUTES-1)*60000);const result=await app.inject({method:'GET',url:'/protected',headers:{cookie:`${config.SESSION_COOKIE_NAME}=${token}`}});expect(result.statusCode).toBe(200);expect(String(result.headers['set-cookie'])).toContain(`Max-Age=${config.SESSION_IDLE_MINUTES*60}`);expect(String(result.headers['set-cookie'])).toContain('HttpOnly');expect(state.expires).toBe(Date.now()+config.SESSION_IDLE_MINUTES*60000);vi.setSystemTime(Date.now()+120000);expect((await app.inject({method:'GET',url:'/protected',headers:{cookie:`${config.SESSION_COOKIE_NAME}=${token}`}})).statusCode).toBe(200);});
 it('does not resurrect an expired or revoked session',async()=>{state.expires=Date.now()-1;const result=await app.inject({method:'GET',url:'/protected',headers:{cookie:`${config.SESSION_COOKIE_NAME}=${token}`}});expect(result.statusCode).toBe(401);expect(String(result.headers['set-cookie'])).toContain('Max-Age=0');expect(state.expires).toBeLessThan(Date.now());});
 it('logout clears the cookie instead of leaving the renewal cookie active',async()=>{const result=await app.inject({method:'POST',url:'/api/auth/logout',headers:{cookie:`${config.SESSION_COOKIE_NAME}=${token}`}});expect(result.statusCode).toBe(200);expect(state.revoked).toBe(true);expect(result.cookies.every(item=>item.value==='')).toBe(true);});
});
