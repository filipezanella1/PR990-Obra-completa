# Executado no fim de vol.py (depois de cmp_xl.py): exporta o modelo do app (estrutura do painel + base do contrato)
import json as _json, os as _os
_os.makedirs('app_build',exist_ok=True)
def _cv(ref):
    v=D[ref].value
    return v
M={'meta':dict(LE=LE,DET=DET,TOTR=TOTR,END=None,gerado='PR-990 – base de quantidades por estaca',
               inputs=dict(ei='E7',mi='F7',ef='E8',mf='F8',cap='H6',eai='H7',rr='H8',dens='H9'),
               err='N6',sel='N7',frac='N9'),
   'disciplinas':[],'contrato':[],'geometria':[],'info':[],'kpi':[]}
cur=None
for kind,rr,x in plan:
    if kind=='band':
        cur=dict(titulo=x.split('·',1)[1].strip(),num=x.split('·',1)[0].strip(),linhas=[]); M['disciplinas'].append(cur)
    elif kind=='sub':
        cur['linhas'].append(dict(t='sub',r=rr,n=x))
    elif kind=='tot':
        title,a,b,d=x; cur['curto']=title; cur['subtotal']=rr; cur['a']=a; cur['b']=b
    else:
        it_=x; proj=bool(it_.get('tot') or it_.get('le') or it_.get('ld')); cr=it_.get('ct')
        o=dict(t='it',r=rr,c=str(it_.get('c') or ''),n=it_['n'],u=it_.get('u') or '',proj=proj,
               le=bool(it_.get('le')),ld=bool(it_.get('ld')),rateio=it_.get('k')=='r',fonte=D[f'R{rr}'].value or '')
        if cr:
            o.update(ct=cr,base=it_.get('_base'),memq=it_.get('memq') is not None,regra=it_.get('rule'))
        cur['linhas'].append(o)
for k,(lab,f,u,obs) in enumerate(ind):
    M['geometria'].append(dict(r=GEND-len(ind)+k,label=lab,un=u,obs=obs))
for k,(l1,f1,n1,l2,f2,n2) in enumerate(info):
    M['info'].append(dict(r=INFO+1+k,l1=l1,nf1=n1,l2=l2,nf2=n2))
M['kpi']=[dict(cel='B14',cap='B15',label='EXTENSÃO',fmt='m'),dict(cel='E14',cap='E15',label='CBUQ',fmt='t'),dict(cel='G14',cap='G15',label='CORTE (1ª+2ª+3ª)',fmt='m3'),
          dict(cel='I14',cap='I15',label='CONSUMO REAL (PROJETO)',fmt='R$'),dict(cel='P14',cap='P15',label='AJUSTADO AO CONTRATO',fmt='R$')]
for r_ in sorted(CI):
    ci=CI[r_]; cm=CMP[r_]
    M['contrato'].append(dict(linha=r_,codigo=str(ci['code']),servico=ci['serv'],un=ci['un'].replace('m3','m³').replace('m2','m²'),grupo=ci['grp'],
        qtd=ci['q'],preco=ci['p'],valor=ci['fin'],painel=cm['rr'],tipo=cm['kind'],apurado=kind_txt(cm['kind'])+(' · '+cm['src'] if cm['src'] else ''),
        fq=cm['fq'],memoria=(TQ[r_][0] if r_ in TQ else None),memoria_ref=(TQ[r_][1] if r_ in TQ else None),obs=NOTE.get(r_,''),disciplina=cm.get('disc')))
M['discrepancias']=dict(
  d1=[dict(disc=a,cod=b,serv=c,linhas=d,memoria=e,desc=f,trat=g) for a,b,c,d,e,f,g in D1],
  d2=[dict(disc=a,fonte=b,serv=c,un=d,q=(e if not isinstance(e,str) else None),qf=(e if isinstance(e,str) else None),preco=f,obs=g,ref=h) for a,b,c,d,e,f,g,h in D2],
  d3=[dict(disc=a,doc=b,assunto=c,desc=d,efeito=e) for a,b,c,d,e in D3])
_json.dump(M,open('app_build/model.json','w'),ensure_ascii=False)
print('modelo do app exportado:',sum(len(d['linhas']) for d in M['disciplinas']),'linhas,',len(M['contrato']),'itens do contrato')
