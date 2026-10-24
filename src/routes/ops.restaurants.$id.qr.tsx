import { createFileRoute, redirect } from '@tanstack/react-router';
import { useDemoState } from '@/data/useDemoState';
import { demoRepo } from '@/data/repo';
import { requireRole } from '@/data/session';
import { QrPrintPack } from '@/components/patron/QrPrintPack';
export const Route=createFileRoute('/ops/restaurants/$id/qr')({beforeLoad:()=>{if(!requireRole('operator')(demoRepo.read().session))throw redirect({to:'/demo'});},ssr:false,component:QrOperator});
function QrOperator(){const{id}=Route.useParams();const state=useSyncExternalStore(demoRepo.subscribe,demoRepo.read,demoRepo.read);const restaurant=state.restaurants.find(item=>item.id===id);return <main className="demo-hub page-width">{restaurant?<><p className="eyebrow"><span className="eyebrow-line"/>QR print pack</p><h1>{restaurant.name}.</h1><QrPrintPack restaurant={restaurant}/></>:<h1>Restaurant not found.</h1>}</main>;}
