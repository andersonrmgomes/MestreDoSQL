/* ===== 1. Dados de exemplo (3 tabelas) ===== */
const NOME={c:'clientes',p:'pedidos',pr:'produtos',v:'vendas'};
const T={
 c:[{id:1,nome:'Ana'},{id:2,nome:'Bruno'},{id:3,nome:'Carla'},{id:4,nome:'Diego'}],
 p:[{id:101,cliente_id:1,produto_id:2,valor:80},{id:102,cliente_id:1,produto_id:1,valor:25},
    {id:103,cliente_id:2,produto_id:1,valor:60},{id:104,cliente_id:null,produto_id:3,valor:40}],
 pr:[{id:1,nome:'Caneta'},{id:2,nome:'Caderno'},{id:3,nome:'Mochila'},{id:4,nome:'Régua'}],
 // tabela usada nos módulos de agregação e GROUP BY (note os NULL em desconto)
 v:[{id:1,vendedor:'Ana',regiao:'Sul',valor:100,desconto:10},{id:2,vendedor:'Ana',regiao:'Norte',valor:200,desconto:null},
    {id:3,vendedor:'Bruno',regiao:'Norte',valor:150,desconto:15},{id:4,vendedor:'Bruno',regiao:'Norte',valor:50,desconto:null},
    {id:5,vendedor:'Carla',regiao:'Sul',valor:300,desconto:30},{id:6,vendedor:'Carla',regiao:'Sul',valor:100,desconto:null},
    {id:7,vendedor:'Diego',regiao:'Norte',valor:250,desconto:25},{id:8,vendedor:'Ana',regiao:'Sul',valor:50,desconto:5}]
};

/* ===== 2. Mini-interpretador de JOINs =====
   Cada consulta é descrita como objeto: tabela base, lista de JOINs, WHERE e colunas.
   NULL nunca é igual a nada (como no SQL real). */
const pf=(a,r)=>Object.fromEntries(Object.entries(r).map(([k,v])=>[a+'.'+k,v]));
const eq=(a,b)=>(l,r)=>{const x={...l,...r};return x[a]!=null&&x[a]===x[b]};
const J=(k,t,on)=>({k,t,on}), Q=(t,joins,cols,w)=>({t,joins,cols,w});
function join(L,keys,{k,t,on}){
  const R=T[t].map(r=>pf(t,r)), nR=Object.fromEntries(Object.keys(R[0]).map(x=>[x,null]));
  const nL=Object.fromEntries(keys.map(x=>[x,null])), out=[], used=new Set();
  L.forEach(l=>{let m=false;
    R.forEach((r,i)=>{if(k==='cross'||on(l,r)){out.push({...l,...r});m=true;used.add(i)}});
    if(!m&&(k==='left'||k==='full'))out.push({...l,...nR})});
  if(k==='right'||k==='full')R.forEach((r,i)=>{if(!used.has(i))out.push({...nL,...r})});
  keys.push(...Object.keys(R[0])); return out;
}
function run(q){
  if(q.err)return{err:q.err};
  if(q.parts){ // UNION / UNION ALL
    let rows=q.parts.flatMap(p=>run(p).rows);
    if(q.dedupe)rows=[...new Map(rows.map(r=>[JSON.stringify(r),r])).values()];
    return{rows,cols:q.parts[0].cols};
  }
  let rows=T[q.t].map(r=>pf(q.t,r)), keys=Object.keys(rows[0]);
  q.joins.forEach(j=>rows=join(rows,keys,j));
  if(q.w)rows=rows.filter(q.w);
  if(q.agg){ // agregação: linhas -> grupos (GROUP BY) -> HAVING -> SELECT
    let gs=q.g?[...rows.reduce((m,r)=>{const k=JSON.stringify(q.g.map(c=>r[K_(c)]));m.set(k,[...(m.get(k)||[]),r]);return m},new Map()).values()]:[rows];
    if(q.h)gs=gs.filter(q.h);
    return{rows:gs.map(g=>q.sel.map(x=>x[1](g))),cols:q.sel.map(x=>x[0])};
  }
  if(q.o)rows=[...rows].sort((a,b)=>(a[K_(q.o[0])]-b[K_(q.o[0])])*(q.o[1]==='desc'?-1:1)); // ORDER BY
  let out=rows.map(r=>q.cols.map(c=>r[c]));
  if(q.d)out=[...new Map(out.map(r=>[JSON.stringify(r),r])).values()];                      // DISTINCT
  if(q.lim)out=out.slice(0,q.lim);                                                           // LIMIT
  return{rows:out,cols:q.np?q.cols.map(c=>c.replace('v.','')):q.cols};
}

/* ===== 3. Fases (cada opção traz o SQL, a consulta simulada e a explicação) ===== */
const o=(sql,q,ok,why)=>({sql,q,ok,why});
const CP=['c.nome','p.id','p.valor'], eCP=eq('c.id','p.cliente_id');
const H='SELECT c.nome, p.id, p.valor\nFROM clientes c\n';
const qL5=Q('c',[J('left','p',eCP)],['c.nome','p.id']), qR5=Q('c',[J('right','p',eCP)],['c.nome','p.id']);
const S5='SELECT c.nome, p.id FROM clientes c\n';
const G8='SELECT c.nome, pr.nome AS produto\n';
const eCP2=(l,r)=>eCP(l,r)&&r['p.valor']>50, eCP3=eq('p.produto_id','pr.id');
const C8=['c.nome','pr.nome'];
const P=[
{t:'INNER JOIN',v:'inner',lab:['clientes','pedidos'],
 obj:'Liste apenas os clientes que fizeram pedidos, com o id e o valor de cada pedido.',
 exp:'INNER JOIN devolve só as linhas que têm correspondência nas DUAS tabelas (a interseção). Carla e Diego (sem pedidos) e o pedido 104 (sem cliente) ficam de fora.',
 opts:[o(H+'INNER JOIN pedidos p ON c.id = p.cliente_id;',Q('c',[J('inner','p',eCP)],CP),1,'Correto: só entram pares que casam no ON.'),
  o(H+'LEFT JOIN pedidos p ON c.id = p.cliente_id;',Q('c',[J('left','p',eCP)],CP),0,'LEFT mantém todos os clientes, então Carla e Diego aparecem com NULL.'),
  o(H+'RIGHT JOIN pedidos p ON c.id = p.cliente_id;',Q('c',[J('right','p',eCP)],CP),0,'RIGHT mantém todos os pedidos, inclusive o 104 que não tem cliente.'),
  o(H+'CROSS JOIN pedidos p;',Q('c',[J('cross','p')],CP),0,'CROSS JOIN não usa condição: combina tudo com tudo (4×4 = 16 linhas).')]},
{t:'LEFT JOIN',v:'left',lab:['clientes','pedidos'],
 obj:'Liste TODOS os clientes, mesmo os que não fizeram pedidos.',
 exp:'LEFT JOIN mantém todas as linhas da tabela da esquerda (a do FROM). Sem correspondência, as colunas da direita vêm como NULL.',
 opts:[o(H+'LEFT JOIN pedidos p ON c.id = p.cliente_id;',Q('c',[J('left','p',eCP)],CP),1,'Correto: clientes à esquerda, todos preservados.'),
  o(H+'INNER JOIN pedidos p ON c.id = p.cliente_id;',Q('c',[J('inner','p',eCP)],CP),0,'INNER descarta clientes sem pedido (Carla e Diego sumiram).'),
  o(H+'RIGHT JOIN pedidos p ON c.id = p.cliente_id;',Q('c',[J('right','p',eCP)],CP),0,'RIGHT preserva os pedidos, não os clientes.'),
  o('SELECT c.nome, p.id, p.valor\nFROM pedidos p\nLEFT JOIN clientes c ON c.id = p.cliente_id;',Q('p',[J('left','c',eCP)],CP),0,'A ordem importa! Aqui a esquerda é pedidos: aparece o pedido 104 sem cliente e Carla/Diego somem.')]},
{t:'RIGHT JOIN',v:'right',lab:['clientes','pedidos'],
 obj:'Liste TODOS os pedidos, mesmo os que não têm cliente associado (cliente_id NULL).',
 exp:'RIGHT JOIN é o espelho do LEFT: preserva todas as linhas da tabela da direita (pedidos). O pedido 104 aparece com nome NULL.',
 opts:[o(H+'RIGHT JOIN pedidos p ON c.id = p.cliente_id;',Q('c',[J('right','p',eCP)],CP),1,'Correto: pedidos estão à direita e todos são preservados.'),
  o(H+'LEFT JOIN pedidos p ON c.id = p.cliente_id;',Q('c',[J('left','p',eCP)],CP),0,'LEFT preserva clientes: o pedido 104 não aparece.'),
  o(H+'INNER JOIN pedidos p ON c.id = p.cliente_id;',Q('c',[J('inner','p',eCP)],CP),0,'INNER perde o pedido 104.'),
  o('SELECT c.nome, p.id, p.valor\nFROM pedidos p\nRIGHT JOIN clientes c ON c.id = p.cliente_id;',Q('p',[J('right','c',eCP)],CP),0,'Trocar a ordem inverte o efeito: agora preserva clientes, e o pedido 104 some.')]},
{t:'Anti-join (achar quem não tem par)',v:'anti',lab:['clientes','pedidos'],
 obj:'Liste os clientes que NUNCA fizeram pedido.',
 exp:'Truque clássico: LEFT JOIN + WHERE coluna_da_direita IS NULL. Fica só o que não achou par. Lembre: NULL se testa com IS NULL, nunca com = NULL.',
 opts:[o('SELECT c.id, c.nome\nFROM clientes c\nLEFT JOIN pedidos p ON c.id = p.cliente_id\nWHERE p.id IS NULL;',Q('c',[J('left','p',eCP)],['c.id','c.nome'],r=>r['p.id']===null),1,'Correto: Carla e Diego não casaram, então p.id é NULL.'),
  o('SELECT c.id, c.nome\nFROM clientes c\nLEFT JOIN pedidos p ON c.id = p.cliente_id\nWHERE p.id = NULL;',Q('c',[J('left','p',eCP)],['c.id','c.nome'],()=>false),0,'Comparar com "= NULL" resulta em desconhecido, nunca verdadeiro: resultado vazio.'),
  o('SELECT c.id, c.nome\nFROM clientes c\nINNER JOIN pedidos p ON c.id = p.cliente_id\nWHERE p.id IS NULL;',Q('c',[J('inner','p',eCP)],['c.id','c.nome'],r=>r['p.id']===null),0,'INNER já eliminou quem não tem pedido; o WHERE não encontra nada.'),
  o('SELECT c.id, c.nome\nFROM clientes c\nLEFT JOIN pedidos p ON c.id = p.cliente_id;',Q('c',[J('left','p',eCP)],['c.id','c.nome']),0,'Sem o WHERE, todos os clientes voltam (Ana duas vezes).')]},
{t:'FULL OUTER JOIN simulado com UNION',v:'full',lab:['clientes','pedidos'],
 obj:'Liste todos os clientes E todos os pedidos, tenham ou não correspondência (o MySQL não tem FULL OUTER JOIN!).',
 exp:'Simulação: LEFT JOIN UNION RIGHT JOIN. O UNION remove as linhas duplicadas (as que casaram aparecem nos dois lados). UNION ALL manteria as duplicatas.',
 opts:[o(S5+'LEFT JOIN pedidos p ON c.id = p.cliente_id\nUNION\n'+S5+'RIGHT JOIN pedidos p ON c.id = p.cliente_id;',{parts:[qL5,qR5],dedupe:1},1,'Correto: LEFT + RIGHT, e o UNION elimina duplicatas.'),
  o(S5+'FULL OUTER JOIN pedidos p ON c.id = p.cliente_id;',{err:'ERROR 1064 (42000): You have an error in your SQL syntax near \'FULL OUTER JOIN\'. O MySQL não suporta FULL OUTER JOIN.'},0,'Sintaxe inexistente no MySQL: dá erro.'),
  o(S5+'LEFT JOIN pedidos p ON c.id = p.cliente_id\nUNION ALL\n'+S5+'RIGHT JOIN pedidos p ON c.id = p.cliente_id;',{parts:[qL5,qR5]},0,'UNION ALL não remove duplicatas: Ana e Bruno aparecem repetidos.'),
  o(S5+'LEFT JOIN pedidos p ON c.id = p.cliente_id;',qL5,0,'Só LEFT: falta o pedido 104, que não tem cliente.')]},
{t:'CROSS JOIN',v:'cross',lab:['clientes','produtos'],
 obj:'Gere todas as combinações possíveis de cliente × produto (ex.: para montar uma tabela de ofertas).',
 exp:'CROSS JOIN faz o produto cartesiano: cada linha da esquerda com cada linha da direita (4 × 4 = 16). Não tem ON.',
 opts:[o('SELECT c.nome, pr.nome\nFROM clientes c\nCROSS JOIN produtos pr;',Q('c',[J('cross','pr')],C8),1,'Correto: 16 combinações.'),
  o('SELECT c.nome, pr.nome\nFROM clientes c\nINNER JOIN produtos pr ON c.id = pr.id;',Q('c',[J('inner','pr',eq('c.id','pr.id'))],C8),0,'Com o ON, só casa id com id: 4 linhas sem sentido.'),
  o('SELECT c.nome, pr.nome\nFROM clientes c\nLEFT JOIN produtos pr ON c.id = pr.id;',Q('c',[J('left','pr',eq('c.id','pr.id'))],C8),0,'LEFT com ON filtra por id igual; não gera todas as combinações.'),
  o('SELECT c.nome, pr.nome\nFROM clientes c\nRIGHT JOIN produtos pr ON c.id = pr.id;',Q('c',[J('right','pr',eq('c.id','pr.id'))],C8),0,'RIGHT com ON também só casa id com id.')]},
{t:'Condição extra: ON × WHERE',v:'left',lab:['clientes','pedidos'],
 obj:'Liste TODOS os clientes e, junto, apenas os pedidos com valor acima de 50. Quem não tem pedido grande continua na lista com NULL.',
 exp:'Num LEFT JOIN, filtro sobre a tabela da direita deve ir no ON. No WHERE ele elimina as linhas NULL e transforma o LEFT em INNER na prática.',
 opts:[o(H+'LEFT JOIN pedidos p ON c.id = p.cliente_id AND p.valor > 50;',Q('c',[J('left','p',eCP2)],CP),1,'Correto: o filtro participa da junção, e os clientes sem pedido grande permanecem.'),
  o(H+'LEFT JOIN pedidos p ON c.id = p.cliente_id\nWHERE p.valor > 50;',Q('c',[J('left','p',eCP)],CP,r=>r['p.valor']>50),0,'O WHERE roda depois do JOIN e descarta NULLs (NULL > 50 não é verdadeiro): Carla e Diego somem.'),
  o(H+'INNER JOIN pedidos p ON c.id = p.cliente_id AND p.valor > 50;',Q('c',[J('inner','p',eCP2)],CP),0,'INNER não preserva clientes sem pedido grande.'),
  o(H+'RIGHT JOIN pedidos p ON c.id = p.cliente_id AND p.valor > 50;',Q('c',[J('right','p',eCP2)],CP),0,'RIGHT preserva pedidos (não clientes) e traz pedidos pequenos com NULL.')]},
{t:'Desafio final: múltiplos JOINs',v:'left',lab:['clientes','pedidos'],
 obj:'Liste TODOS os clientes com o nome do produto que compraram (NULL se não comprou nada).',
 exp:'Com vários JOINs, a cadeia inteira precisa preservar os clientes: LEFT em todos. Um INNER no fim elimina as linhas com NULL geradas pelo LEFT anterior.',
 opts:[o(G8+'FROM clientes c\nLEFT JOIN pedidos p ON c.id = p.cliente_id\nLEFT JOIN produtos pr ON pr.id = p.produto_id;',Q('c',[J('left','p',eCP),J('left','pr',eCP3)],C8),1,'Correto: os dois LEFT mantêm Carla e Diego com NULL.'),
  o(G8+'FROM clientes c\nLEFT JOIN pedidos p ON c.id = p.cliente_id\nINNER JOIN produtos pr ON pr.id = p.produto_id;',Q('c',[J('left','p',eCP),J('inner','pr',eCP3)],C8),0,'O INNER final descarta as linhas em que p.produto_id é NULL (Carla e Diego).'),
  o(G8+'FROM produtos pr\nLEFT JOIN pedidos p ON pr.id = p.produto_id\nLEFT JOIN clientes c ON c.id = p.cliente_id;',Q('pr',[J('left','p',eq('pr.id','p.produto_id')),J('left','c',eCP)],C8),0,'Começa por produtos: preserva produtos (Mochila, Régua), não clientes.'),
  o(G8+'FROM clientes c\nINNER JOIN pedidos p ON c.id = p.cliente_id\nINNER JOIN produtos pr ON pr.id = p.produto_id;',Q('c',[J('inner','p',eCP),J('inner','pr',eCP3)],C8),0,'Só INNER: apenas quem comprou aparece.')]}
];

/* ===== 3b. Módulos de agregação e GROUP BY (tabela vendas) =====
   AG/V montam a consulta: linhas -> WHERE -> grupos -> HAVING -> SELECT */
const K_=c=>c.includes('.')?c:'v.'+c;
const nz=(g,c)=>g.map(r=>r[K_(c)]).filter(x=>x!=null);   // valores não nulos (agregações ignoram NULL)
const sm=(g,c)=>nz(g,c).reduce((a,b)=>a+b,0);
const ag=(l,f)=>[l,f];
const cnt=()=>ag('COUNT(*)',g=>g.length), cn=c=>ag(`COUNT(${c})`,g=>nz(g,c).length),
 cd=c=>ag(`COUNT(DISTINCT ${c})`,g=>new Set(nz(g,c)).size), sum=c=>ag(`SUM(${c})`,g=>nz(g,c).length?sm(g,c):null),
 avg=c=>ag(`AVG(${c})`,g=>nz(g,c).length?+(sm(g,c)/nz(g,c).length).toFixed(2):null),
 max=c=>ag(`MAX(${c})`,g=>nz(g,c).length?Math.max(...nz(g,c)):null), min=c=>ag(`MIN(${c})`,g=>nz(g,c).length?Math.min(...nz(g,c)):null),
 key=c=>ag(c,g=>g[0][K_(c)]);
const AG=(t,joins,sel,w,g,h)=>({agg:1,t,joins,sel,w,g,h}), V=(sel,w,g,h)=>AG('v',[],sel,w,g,h);
const sul=r=>r['v.regiao']==='Sul', val=n=>r=>r['v.valor']>=n;
const E55=c=>({err:`ERROR 1055 (42000): a coluna '${c}' está no SELECT, mas não está no GROUP BY nem dentro de uma função de agregação (only_full_group_by).`});
const E1140={err:"ERROR 1140 (42000): misturar coluna comum (vendedor) com função de agregação sem GROUP BY é inválido com only_full_group_by."};
const E1111={err:'ERROR 1111 (HY000): Invalid use of group function — função de agregação não pode ficar no WHERE.'};
const F='\nFROM vendas';
const PA=[
{t:'COUNT(*)',obj:'Quantas vendas foram registradas na tabela?',exp:'COUNT(*) conta linhas, não importa o conteúdo delas (nem NULL).',
 opts:[o('SELECT COUNT(*)'+F+';',V([cnt()]),1,'Correto: 8 linhas.'),
 o('SELECT SUM(valor)'+F+';',V([sum('valor')]),0,'SUM soma os valores (1200); não conta linhas.'),
 o('SELECT COUNT(desconto)'+F+';',V([cn('desconto')]),0,'COUNT(coluna) ignora NULL: só conta as 5 vendas com desconto.'),
 o('SELECT COUNT(DISTINCT vendedor)'+F+';',V([cd('vendedor')]),0,'DISTINCT conta valores diferentes: 4 vendedores, não 8 vendas.')]},
{t:'SUM',obj:'Qual o valor total vendido?',exp:'SUM soma os valores não nulos de uma coluna numérica.',
 opts:[o('SELECT SUM(valor)'+F+';',V([sum('valor')]),1,'Correto: 1200.'),
 o('SELECT COUNT(valor)'+F+';',V([cn('valor')]),0,'COUNT conta quantas vendas têm valor (8), não soma.'),
 o('SELECT AVG(valor)'+F+';',V([avg('valor')]),0,'AVG devolve a média (150), não o total.'),
 o('SELECT MAX(valor)'+F+';',V([max('valor')]),0,'MAX devolve só a maior venda (300).')]},
{t:'AVG',obj:'Qual o valor médio por venda?',exp:'AVG = soma dos valores não nulos ÷ quantidade de valores não nulos.',
 opts:[o('SELECT AVG(valor)'+F+';',V([avg('valor')]),1,'Correto: 1200 ÷ 8 = 150.'),
 o('SELECT SUM(valor) / COUNT(desconto)'+F+';',V([ag('SUM(valor) / COUNT(desconto)',g=>+(sm(g,'valor')/nz(g,'desconto').length).toFixed(2))]),0,'Divisor errado: COUNT(desconto) conta só 5 linhas, inflando a média.'),
 o('SELECT AVG(desconto)'+F+';',V([avg('desconto')]),0,'Coluna errada, e ainda ignora os NULL (média de 5 descontos).'),
 o('SELECT SUM(valor)'+F+';',V([sum('valor')]),0,'É o total, não a média.')]},
{t:'MAX e MIN',obj:'Qual a maior e a menor venda (valor)?',exp:'MAX e MIN devolvem o maior e o menor valor não nulo da coluna.',
 opts:[o('SELECT MAX(valor), MIN(valor)'+F+';',V([max('valor'),min('valor')]),1,'Correto: 300 e 50.'),
 o('SELECT MAX(valor), MAX(desconto)'+F+';',V([max('valor'),max('desconto')]),0,'O segundo campo é o maior desconto, não a menor venda.'),
 o('SELECT MIN(valor), MIN(desconto)'+F+';',V([min('valor'),min('desconto')]),0,'Falta o maior valor e traz o menor desconto.'),
 o('SELECT MAX(valor), AVG(valor)'+F+';',V([max('valor'),avg('valor')]),0,'AVG é a média (150), não a menor venda.')]},
{t:'NULL nas agregações',obj:'Quantas vendas tiveram desconto informado?',exp:'COUNT(coluna) conta apenas valores NÃO nulos. COUNT(*) conta todas as linhas.',
 opts:[o('SELECT COUNT(desconto)'+F+';',V([cn('desconto')]),1,'Correto: 5 vendas têm desconto.'),
 o('SELECT COUNT(*)'+F+';',V([cnt()]),0,'COUNT(*) conta as 8 linhas, inclusive as com desconto NULL.'),
 o('SELECT SUM(desconto)'+F+';',V([sum('desconto')]),0,'SUM soma os descontos (85); não conta vendas.'),
 o('SELECT COUNT(desconto IS NULL)'+F+';',V([ag('COUNT(desconto IS NULL)',g=>g.length)]),0,'A expressão devolve 0 ou 1 (nunca NULL), então COUNT conta todas as 8 linhas.')]},
{t:'WHERE antes de agregar',obj:"Qual o total vendido na região 'Sul'?",exp:'O WHERE filtra as linhas ANTES de a função de agregação calcular.',
 opts:[o('SELECT SUM(valor)'+F+"\nWHERE regiao = 'Sul';",V([sum('valor')],sul),1,'Correto: 100+300+100+50 = 550.'),
 o('SELECT SUM(valor)'+F+';',V([sum('valor')]),0,'Sem WHERE soma todas as regiões (1200).'),
 o('SELECT SUM(valor)'+F+"\nWHERE regiao = 'Norte';",V([sum('valor')],r=>r['v.regiao']==='Norte'),0,'Filtrou a região errada (Norte).'),
 o('SELECT COUNT(*)'+F+"\nWHERE regiao = 'Sul';",V([cnt()],sul),0,'Filtrou certo, mas COUNT conta vendas (4) em vez de somar valores.')]}
];
const PG=[
{t:'GROUP BY',obj:'Mostre o total vendido por vendedor.',exp:'GROUP BY separa as linhas em grupos (um por vendedor) e a função de agregação roda em cada grupo.',
 opts:[o('SELECT vendedor, SUM(valor)'+F+'\nGROUP BY vendedor;',V([key('vendedor'),sum('valor')],0,['vendedor']),1,'Correto: um total para cada vendedor.'),
 o('SELECT vendedor, SUM(valor)'+F+';',E1140,0,'Sem GROUP BY, o SUM colapsa tudo em 1 linha e vendedor não tem como aparecer.'),
 o('SELECT regiao, SUM(valor)'+F+'\nGROUP BY regiao;',V([key('regiao'),sum('valor')],0,['regiao']),0,'Agrupou por região: é um total válido, mas não o que foi pedido.'),
 o('SELECT vendedor, COUNT(*)'+F+'\nGROUP BY vendedor;',V([key('vendedor'),cnt()],0,['vendedor']),0,'Agrupou certo, mas COUNT(*) conta vendas em vez de somar valores.')]},
{t:'COUNT por grupo',obj:'Quantas vendas houve em cada região?',exp:'COUNT(*) dentro de GROUP BY conta as linhas de cada grupo.',
 opts:[o('SELECT regiao, COUNT(*)'+F+'\nGROUP BY regiao;',V([key('regiao'),cnt()],0,['regiao']),1,'Correto: 4 vendas em cada região.'),
 o('SELECT regiao, COUNT(desconto)'+F+'\nGROUP BY regiao;',V([key('regiao'),cn('desconto')],0,['regiao']),0,'COUNT(desconto) ignora NULL e subconta (3 e 2).'),
 o('SELECT regiao, SUM(valor)'+F+'\nGROUP BY regiao;',V([key('regiao'),sum('valor')],0,['regiao']),0,'SUM soma valores, não conta vendas.'),
 o('SELECT vendedor, COUNT(*)'+F+'\nGROUP BY vendedor;',V([key('vendedor'),cnt()],0,['vendedor']),0,'Agrupou pela coluna errada (vendedor).')]},
{t:'Vários campos no GROUP BY',obj:'Mostre o total vendido por vendedor E região.',exp:'Cada combinação diferente de vendedor+região forma um grupo. Toda coluna não agregada do SELECT precisa estar no GROUP BY.',
 opts:[o('SELECT vendedor, regiao, SUM(valor)'+F+'\nGROUP BY vendedor, regiao;',V([key('vendedor'),key('regiao'),sum('valor')],0,['vendedor','regiao']),1,'Correto: Ana aparece em Sul e em Norte.'),
 o('SELECT vendedor, regiao, SUM(valor)'+F+'\nGROUP BY vendedor;',E55('regiao'),0,'regiao está no SELECT, mas não no GROUP BY: erro no MySQL moderno.'),
 o('SELECT vendedor, regiao, SUM(valor)'+F+'\nGROUP BY regiao;',E55('vendedor'),0,'vendedor está no SELECT, mas não no GROUP BY: erro.'),
 o('SELECT vendedor, regiao, AVG(valor)'+F+'\nGROUP BY vendedor, regiao;',V([key('vendedor'),key('regiao'),avg('valor')],0,['vendedor','regiao']),0,'Agrupou certo, mas AVG calcula a média, não o total.')]},
{t:'HAVING × WHERE',obj:'Liste os vendedores cujo total vendido é maior que 300.',exp:'WHERE filtra linhas antes de agrupar e não aceita agregações. HAVING filtra os grupos depois de calculados.',
 opts:[o('SELECT vendedor, SUM(valor)'+F+'\nGROUP BY vendedor\nHAVING SUM(valor) > 300;',V([key('vendedor'),sum('valor')],0,['vendedor'],g=>sm(g,'valor')>300),1,'Correto: Ana (350) e Carla (400).'),
 o('SELECT vendedor, SUM(valor)'+F+'\nWHERE SUM(valor) > 300\nGROUP BY vendedor;',E1111,0,'Agregação no WHERE não existe: o WHERE roda antes dos grupos.'),
 o('SELECT vendedor, SUM(valor)'+F+'\nWHERE valor > 300\nGROUP BY vendedor;',V([key('vendedor'),sum('valor')],val(300.01),['vendedor']),0,'Filtra vendas individuais > 300 (não há nenhuma): resultado vazio.'),
 o('SELECT vendedor, SUM(valor)'+F+'\nGROUP BY vendedor\nHAVING AVG(valor) > 150;',V([key('vendedor'),sum('valor')],0,['vendedor'],g=>sm(g,'valor')/nz(g,'valor').length>150),0,'HAVING sobre a média: traz Carla e Diego, não o critério de total pedido.')]},
{t:'WHERE + GROUP BY + HAVING',obj:'Considerando só vendas de valor ≥ 100, mostre região e total das regiões cujo total passe de 500.',exp:'Ordem lógica: FROM → WHERE (linhas) → GROUP BY (grupos) → HAVING (filtra grupos) → SELECT.',
 opts:[o('SELECT regiao, SUM(valor)'+F+'\nWHERE valor >= 100\nGROUP BY regiao\nHAVING SUM(valor) > 500;',V([key('regiao'),sum('valor')],val(100),['regiao'],g=>sm(g,'valor')>500),1,'Correto: Sul soma 500 (não passa), Norte soma 600.'),
 o('SELECT regiao, SUM(valor)'+F+'\nGROUP BY regiao\nHAVING SUM(valor) > 500;',V([key('regiao'),sum('valor')],0,['regiao'],g=>sm(g,'valor')>500),0,'Faltou o WHERE: as vendas pequenas entram na soma e as duas regiões passam.'),
 o('SELECT regiao, SUM(valor)'+F+'\nWHERE valor >= 100\nGROUP BY regiao;',V([key('regiao'),sum('valor')],val(100),['regiao']),0,'Faltou o HAVING: traz também Sul (500).'),
 o('SELECT regiao, SUM(valor)'+F+'\nWHERE valor >= 100\nGROUP BY regiao\nHAVING COUNT(*) > 500;',V([key('regiao'),sum('valor')],val(100),['regiao'],g=>g.length>500),0,'COUNT(*) > 500 compara número de linhas, não o total: vazio.')]},
{t:'Desafio: JOIN + GROUP BY',tabs:['c','p'],obj:'Mostre TODOS os clientes e quantos pedidos cada um fez (0 para quem não fez nenhum).',exp:'LEFT JOIN preserva todos os clientes; COUNT(p.id) ignora o NULL gerado pelo LEFT, resultando em 0. COUNT(*) contaria a linha NULL como 1.',
 opts:[o('SELECT c.nome, COUNT(p.id)\nFROM clientes c\nLEFT JOIN pedidos p ON c.id = p.cliente_id\nGROUP BY c.id, c.nome;',AG('c',[J('left','p',eCP)],[key('c.nome'),cn('p.id')],0,['c.id','c.nome']),1,'Correto: Carla e Diego ficam com 0.'),
 o('SELECT c.nome, COUNT(*)\nFROM clientes c\nLEFT JOIN pedidos p ON c.id = p.cliente_id\nGROUP BY c.id, c.nome;',AG('c',[J('left','p',eCP)],[key('c.nome'),cnt()],0,['c.id','c.nome']),0,'COUNT(*) conta a linha NULL do LEFT: Carla e Diego aparecem com 1.'),
 o('SELECT c.nome, COUNT(p.id)\nFROM clientes c\nINNER JOIN pedidos p ON c.id = p.cliente_id\nGROUP BY c.id, c.nome;',AG('c',[J('inner','p',eCP)],[key('c.nome'),cn('p.id')],0,['c.id','c.nome']),0,'INNER elimina clientes sem pedido: Carla e Diego sumiram.'),
 o('SELECT c.nome, COUNT(p.id)\nFROM clientes c\nRIGHT JOIN pedidos p ON c.id = p.cliente_id\nGROUP BY c.nome;',AG('c',[J('right','p',eCP)],[key('c.nome'),cn('p.id')],0,['c.nome']),0,'RIGHT preserva pedidos: surge um grupo NULL (pedido 104) e faltam Carla e Diego.')]}
];
/* Módulos exibidos no menu */
/* ===== 3c. Módulo SELECT básico (tabela vendas) =====
   SEL(colunas, WHERE, [ORDER BY coluna, dir], LIMIT, DISTINCT) */
const SEL=(cols,w,o,lim,d)=>({...Q('v',[],cols.map(c=>'v.'+c),w),o,lim,d,np:1});
const ALL=['id','vendedor','regiao','valor','desconto'], sv=n=>r=>r['v.regiao']===n;
const E54={err:"ERROR 1054 (42S22): Unknown column 'Sul' in 'where clause' — textos precisam de aspas simples."};
const PS=[
{t:'SELECT: escolhendo colunas',obj:'Mostre apenas o vendedor e o valor de todas as vendas.',exp:'Depois do SELECT você lista as colunas desejadas, na ordem em que quer vê-las. O * traz todas as colunas.',
 opts:[o('SELECT vendedor, valor'+F+';',SEL(['vendedor','valor']),1,'Correto: só as duas colunas pedidas.'),
 o('SELECT *'+F+';',SEL(ALL),0,'O * traz todas as colunas (id, região, desconto...), mais do que o pedido.'),
 o('SELECT vendedor'+F+';',SEL(['vendedor']),0,'Faltou a coluna valor.'),
 o('SELECT vendedor, regiao, valor'+F+';',SEL(['vendedor','regiao','valor']),0,'Trouxe a região, que não foi pedida.')]},
{t:'WHERE: filtrando linhas',obj:"Mostre o id e o valor das vendas da região 'Sul'.",exp:'O WHERE filtra as linhas. Textos vão entre aspas simples; sem aspas, o MySQL acha que é o nome de uma coluna.',
 opts:[o('SELECT id, valor'+F+"\nWHERE regiao = 'Sul';",SEL(['id','valor'],sv('Sul')),1,'Correto: 4 vendas do Sul.'),
 o('SELECT id, valor'+F+';',SEL(['id','valor']),0,'Sem WHERE, todas as 8 vendas voltam.'),
 o('SELECT id, valor'+F+"\nWHERE regiao = 'Norte';",SEL(['id','valor'],sv('Norte')),0,'Filtrou a região errada (Norte).'),
 o('SELECT id, valor'+F+'\nWHERE regiao = Sul;',E54,0,'Faltaram as aspas: o MySQL procura uma coluna chamada Sul.')]},
{t:'BETWEEN, AND e OR',obj:'Mostre id e valor das vendas com valor entre 100 e 200 (inclusive).',exp:'BETWEEN a AND b inclui os extremos e exige o menor valor primeiro. Combine condições com AND (todas) ou OR (qualquer uma).',
 opts:[o('SELECT id, valor'+F+'\nWHERE valor BETWEEN 100 AND 200;',SEL(['id','valor'],r=>r['v.valor']>=100&&r['v.valor']<=200),1,'Correto: 100, 200, 150 e 100.'),
 o('SELECT id, valor'+F+'\nWHERE valor > 100 AND valor < 200;',SEL(['id','valor'],r=>r['v.valor']>100&&r['v.valor']<200),0,'> e < excluem os extremos: sobra só o 150.'),
 o('SELECT id, valor'+F+'\nWHERE valor >= 100 OR valor <= 200;',SEL(['id','valor'],r=>r['v.valor']>=100||r['v.valor']<=200),0,'Com OR basta cumprir uma condição: todo número passa. Era AND.'),
 o('SELECT id, valor'+F+'\nWHERE valor BETWEEN 200 AND 100;',SEL(['id','valor'],r=>false),0,'BETWEEN precisa do menor valor primeiro; invertido nunca é verdadeiro.')]},
{t:'IS NULL',obj:'Mostre id e vendedor das vendas que NÃO têm desconto informado.',exp:'NULL significa "valor desconhecido". Por isso nunca se compara com = ou <>: use IS NULL e IS NOT NULL.',
 opts:[o('SELECT id, vendedor'+F+'\nWHERE desconto IS NULL;',SEL(['id','vendedor'],r=>r['v.desconto']===null),1,'Correto: vendas 2, 4 e 6.'),
 o('SELECT id, vendedor'+F+'\nWHERE desconto = NULL;',SEL(['id','vendedor'],r=>false),0,'"= NULL" nunca é verdadeiro: resultado vazio.'),
 o('SELECT id, vendedor'+F+'\nWHERE desconto = 0;',SEL(['id','vendedor'],r=>r['v.desconto']===0),0,'Zero é um valor; NULL é ausência de valor. Nenhuma linha tem 0.'),
 o('SELECT id, vendedor'+F+'\nWHERE desconto IS NOT NULL;',SEL(['id','vendedor'],r=>r['v.desconto']!==null),0,'É o contrário: traz quem TEM desconto.')]},
{t:'ORDER BY e LIMIT',obj:'Mostre vendedor e valor das 3 maiores vendas.',exp:'ORDER BY ordena (ASC é o padrão, DESC é decrescente) e LIMIT corta a quantidade de linhas. Sem ORDER BY, "as primeiras linhas" não significam as maiores.',
 opts:[o('SELECT vendedor, valor'+F+'\nORDER BY valor DESC\nLIMIT 3;',SEL(['vendedor','valor'],0,['valor','desc'],3),1,'Correto: 300, 250 e 200.'),
 o('SELECT vendedor, valor'+F+'\nORDER BY valor\nLIMIT 3;',SEL(['vendedor','valor'],0,['valor','asc'],3),0,'Ordem crescente (padrão): trouxe as 3 MENORES.'),
 o('SELECT vendedor, valor'+F+'\nLIMIT 3;',SEL(['vendedor','valor'],0,0,3),0,'Sem ORDER BY, pega apenas as 3 primeiras linhas da tabela.'),
 o('SELECT vendedor, valor'+F+'\nORDER BY valor DESC;',SEL(['vendedor','valor'],0,['valor','desc']),0,'Ordenou certo, mas sem LIMIT retorna todas as 8 vendas.')]},
{t:'DISTINCT',obj:'Liste os vendedores que já fizeram vendas, sem repetir nomes.',exp:'DISTINCT remove linhas repetidas do resultado (considerando todas as colunas do SELECT).',
 opts:[o('SELECT DISTINCT vendedor'+F+';',SEL(['vendedor'],0,0,0,1),1,'Correto: 4 vendedores únicos.'),
 o('SELECT vendedor'+F+';',SEL(['vendedor']),0,'Sem DISTINCT, o nome repete a cada venda (8 linhas).'),
 o('SELECT DISTINCT vendedor, regiao'+F+';',SEL(['vendedor','regiao'],0,0,0,1),0,'DISTINCT vale para a combinação das colunas: Ana aparece em Sul e Norte.'),
 o('SELECT COUNT(DISTINCT vendedor)'+F+';',V([cd('vendedor')]),0,'Isso devolve só o número 4, não a lista de nomes.')]},
{t:'LIKE',obj:"Mostre vendedor e valor das vendas de vendedores cujo nome começa com 'C'.",exp:"LIKE busca padrões: % significa qualquer quantidade de caracteres e _ exatamente um. 'C%' = começa com C. Com = os curingas não funcionam.",
 opts:[o('SELECT vendedor, valor'+F+"\nWHERE vendedor LIKE 'C%';",SEL(['vendedor','valor'],r=>/^c/i.test(r['v.vendedor'])),1,'Correto: as duas vendas da Carla.'),
 o('SELECT vendedor, valor'+F+"\nWHERE vendedor LIKE '%C';",SEL(['vendedor','valor'],r=>/c$/i.test(r['v.vendedor'])),0,"'%C' = TERMINA com C: ninguém."),
 o('SELECT vendedor, valor'+F+"\nWHERE vendedor = 'C%';",SEL(['vendedor','valor'],r=>r['v.vendedor']==="C%"),0,'Com = o % é um caractere comum; nenhum nome é literalmente "C%".'),
 o('SELECT vendedor, valor'+F+"\nWHERE vendedor LIKE '%a';",SEL(['vendedor','valor'],r=>/a$/i.test(r['v.vendedor'])),0,"'%a' = termina com A: traz Ana e Carla.")]},
{t:'Desafio final: tudo junto',obj:'Mostre vendedor, valor e desconto das 2 maiores vendas da região Norte que tenham desconto informado.',exp:'Ordem lógica: FROM → WHERE → SELECT → DISTINCT → ORDER BY → LIMIT. Cuidado: OR amplia o filtro, AND o restringe.',
 opts:[o('SELECT vendedor, valor, desconto'+F+"\nWHERE regiao = 'Norte' AND desconto IS NOT NULL\nORDER BY valor DESC\nLIMIT 2;",SEL(['vendedor','valor','desconto'],r=>r['v.regiao']==='Norte'&&r['v.desconto']!==null,['valor','desc'],2),1,'Correto: Diego (250) e Bruno (150).'),
 o('SELECT vendedor, valor, desconto'+F+"\nWHERE regiao = 'Norte'\nORDER BY valor DESC\nLIMIT 2;",SEL(['vendedor','valor','desconto'],sv('Norte'),['valor','desc'],2),0,'Faltou exigir desconto: entrou a venda da Ana com desconto NULL.'),
 o('SELECT vendedor, valor, desconto'+F+"\nWHERE regiao = 'Norte' OR desconto IS NOT NULL\nORDER BY valor DESC\nLIMIT 2;",SEL(['vendedor','valor','desconto'],r=>r['v.regiao']==='Norte'||r['v.desconto']!==null,['valor','desc'],2),0,'OR amplia o filtro: entrou a venda da Carla (Sul), que tem desconto.'),
 o('SELECT vendedor, valor, desconto'+F+"\nWHERE regiao = 'Norte' AND desconto IS NULL\nORDER BY valor DESC\nLIMIT 2;",SEL(['vendedor','valor','desconto'],r=>r['v.regiao']==='Norte'&&r['v.desconto']===null,['valor','desc'],2),0,'IS NULL traz justamente as vendas SEM desconto.')]}
];
const MODS=[
{id:'select',nome:'SELECT básico',ico:'🔎',desc:'SELECT, WHERE, ORDER BY, LIMIT, DISTINCT e LIKE',tabs:['v'],phases:PS,
 sum:'SELECT escolhe colunas · WHERE filtra linhas (texto entre aspas, NULL com IS NULL) · ORDER BY + LIMIT para rankings · DISTINCT remove repetidos · LIKE com % e _ · AND restringe, OR amplia.'},
{id:'joins',nome:'JOINs',ico:'🧩',desc:'INNER, LEFT, RIGHT, FULL (via UNION) e CROSS JOIN',tabs:['c','p','pr'],phases:P,
 sum:'INNER = só a interseção · LEFT/RIGHT = preservam um lado (o resto vira NULL) · FULL = LEFT UNION RIGHT · CROSS = todas as combinações · filtro da tabela preservada vai no ON, não no WHERE.'},
{id:'agg',nome:'Funções de agregação',ico:'🧮',desc:'COUNT, SUM, AVG, MIN, MAX e o efeito do NULL',tabs:['v'],phases:PA,
 sum:'COUNT(*) conta linhas · COUNT(coluna), SUM, AVG, MIN e MAX ignoram NULL · WHERE filtra as linhas antes de agregar.'},
{id:'group',nome:'GROUP BY e HAVING',ico:'📊',desc:'Agrupar, filtrar grupos e combinar com JOIN',tabs:['v'],phases:PG,bars:1,
 sum:'GROUP BY forma grupos · toda coluna do SELECT está no GROUP BY ou dentro de uma agregação · WHERE filtra linhas antes, HAVING filtra grupos depois · com LEFT JOIN, use COUNT(coluna_da_direita).'}
];

/* ===== 4. Utilitários de visualização ===== */
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const hl=s=>esc(s).replace(/\b(SELECT|FROM|ORDER BY|LIMIT|LIKE|BETWEEN|DESC|ASC|OR|NOT|GROUP BY|HAVING|DISTINCT|COUNT|SUM|AVG|MIN|MAX|FULL OUTER JOIN|INNER JOIN|LEFT JOIN|RIGHT JOIN|CROSS JOIN|UNION ALL|UNION|WHERE|AND|ON|IS NOT NULL|IS NULL|NULL|AS)\b/g,'<b>$1</b>');
const cell=v=>v===null?'<td class="n">NULL</td>':'<td>'+esc(v)+'</td>';
const tbl=(h,rows)=>`<div class="wrap"><table><tr>${h.map(x=>'<th>'+x+'</th>').join('')}</tr>${rows.map(r=>'<tr>'+r.map(cell).join('')+'</tr>').join('')}</table></div>`;
const srcTable=a=>{const r=T[a],k=Object.keys(r[0]);return `<div><h2>${NOME[a]}</h2>${tbl(k,r.map(x=>k.map(c=>x[c])))}</div>`};
function resultHTML(q){const r=run(q);
  if(r.err)return`<div class="err">${esc(r.err)}</div>`;
  return`<p><b>Resultado (${r.rows.length} linha${r.rows.length==1?'':'s'}):</b></p>`+(r.rows.length?tbl(r.cols,r.rows):'<p><i>Nenhuma linha retornada.</i></p>');}
/* Diagrama de Venn em SVG: círculo esquerdo = tabela do FROM, direito = tabela do JOIN */
function venn(t,lab){
  const A=['left','full','anti','cross'].includes(t),B=['right','full','cross'].includes(t);
  return`<svg viewBox="0 0 220 130" class="venn"><defs><clipPath id="ca"><circle cx="85" cy="60" r="45"/></clipPath></defs>
  <circle cx="85" cy="60" r="45" fill="${A?'#4f8cff':'none'}" opacity=".75"/><circle cx="135" cy="60" r="45" fill="${B?'#ff9f43':'none'}" opacity=".75"/>
  <circle cx="135" cy="60" r="45" clip-path="url(#ca)" fill="${t==='anti'?'#fff':'#8e5cf7'}"/>
  <circle cx="85" cy="60" r="45" fill="none" stroke="#334" stroke-width="2"/><circle cx="135" cy="60" r="45" fill="none" stroke="#334" stroke-width="2"/>
  <text x="62" y="125" font-size="12" text-anchor="middle">${lab[0]}</text><text x="158" y="125" font-size="12" text-anchor="middle">${lab[1]}</text></svg>
  <p class="center"><small>Área colorida = linhas que entram no resultado.</small></p>`;}

/* ===== 5. Estado, menu e telas ===== */
const app=document.getElementById('app');
let S;
// recordes guardados no navegador (se disponível)
const getBest=()=>{try{return JSON.parse(localStorage.getItem('sqlbest')||'{}')}catch(e){return{}}};
const setBest=(id,v)=>{try{const b=getBest();if(v>(b[id]||0)){b[id]=v;localStorage.setItem('sqlbest',JSON.stringify(b))}}catch(e){}};
/* Barras: visualiza o valor (última coluna) de cada grupo */
function bars(r){if(!r.rows||!r.rows.length)return'';
  const mx=Math.max(...r.rows.map(x=>x[x.length-1]||0),1);
  return'<div><p><small>Valor por grupo:</small></p>'+r.rows.map(x=>{const v=x[x.length-1];
    return`<div class="bar2"><span>${esc(x.slice(0,-1).map(c=>c===null?'NULL':c).join(' / '))}</span><i style="width:${Math.round((v||0)/mx*55)}%"></i><b>${v}</b></div>`}).join('')+'</div>'}
function menu(){
  const b=getBest();
  app.innerHTML=`<div class="card center"><h1>🧠 Mestre do SQL</h1><p>Escolha um módulo e aprenda MySQL jogando.</p></div>
  <div class="menu">${MODS.map((m,i)=>`<button class="mod" onclick="play(${i})"><span class="ico">${m.ico}</span><b>${m.nome}</b><small>${m.desc}</small>
  <small>${m.phases.length} fases${b[m.id]!=null?` · 🏅 recorde: ${b[m.id]}/${m.phases.length*100}`:''}</small></button>`).join('')}</div>
  <div class="card center"><small>Pontos: 100 de primeira, 60 na 2ª tentativa, 30 na 3ª · 3 vidas ❤️ por módulo.</small></div>`;
}
function play(i){S={M:MODS[i],i:0,pts:0,lives:3,tries:0,log:[],locked:false,bad:[]};phase()}
function phase(){
  const p=S.M.phases[S.i],tabs=p.tabs||S.M.tabs;S.tries=0;S.locked=false;S.bad=[];
  const order=p.opts.map((_,i)=>i).sort(()=>Math.random()-.5);
  app.innerHTML=`<div class="card bar"><button class="ghost" onclick="menu()">☰ Menu</button><span class="pill">${S.M.ico} ${S.M.nome} · ${S.i+1}/${S.M.phases.length}</span><span>⭐ ${S.pts}</span><span id="lv">${'❤️'.repeat(S.lives)}</span></div>
  <div class="card"><h2>${p.t}</h2><p><b>🎯 Objetivo:</b> ${p.obj}</p>
  <details ${S.i===0?'open':''}><summary>Ver tabelas</summary><div class="tables">${tabs.map(srcTable).join('')}</div></details></div>
  <div class="card"><p><b>Qual consulta cumpre o objetivo?</b></p>
  ${order.map(i=>`<button class="opt" id="o${i}" onclick="pick(${i})"><pre>${hl(p.opts[i].sql)}</pre></button>`).join('')}</div>
  <div id="fb"></div>`;
}
function pick(i){
  if(S.locked||S.bad.includes(i))return;
  const p=S.M.phases[S.i],op=p.opts[i],last=S.i+1>=S.M.phases.length;S.tries++;
  const btn=document.getElementById('o'+i),fb=document.getElementById('fb');
  if(op.ok){
    const gain=[100,60,30][Math.min(S.tries,3)-1];S.pts+=gain;S.locked=true;S.log.push({t:p.t,tries:S.tries,gain});
    btn.classList.add('good');
    const vis=p.v?venn(p.v,p.lab):S.M.bars?bars(run(op.q)):'';
    fb.innerHTML=`<div class="card fb ok"><h2 class="ok">✅ Correto! +${gain} pts</h2><p>${op.why}</p><p>${p.exp}</p>
    <div class="${vis?'split':''}"><div>${resultHTML(op.q)}</div>${vis?'<div>'+vis+'</div>':''}</div>
    <button class="big" onclick="next()">${last?'Ver resultado final 🏆':'Próxima fase ➜'}</button></div>`;
  }else{
    S.lives--;S.bad.push(i);btn.classList.add('bad');btn.disabled=true;
    document.getElementById('lv').textContent=S.lives?'❤️'.repeat(S.lives):'💔';
    const over=S.lives<=0;if(over){S.locked=true;S.log.push({t:p.t,tries:S.tries,gain:0});}
    fb.innerHTML=`<div class="card fb no"><h2 class="no">❌ Não foi dessa vez${over?' — acabaram as vidas!':''}</h2><p>${op.why}</p>${resultHTML(op.q)}
    ${over?'<button class="big" onclick="end()">Ver resultado</button>':'<p>Tente outra opção (você perdeu 1 vida).</p>'}</div>`;
  }
  fb.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function next(){S.i++;S.i<S.M.phases.length?phase():end()}
function end(){
  const n=S.M.phases.length,won=S.lives>0&&S.log.length===n&&S.log[n-1].gain>0,max=n*100,pct=Math.round(S.pts/max*100);
  setBest(S.M.id,S.pts);
  const nivel=!won?'Continue treinando! 💪':pct>=85?'Mestre! 🏆':pct>=55?'Quase lá, ótimo desempenho! 🌟':'Você concluiu! Revise os conceitos. 📚';
  app.innerHTML=`<div class="card center"><h1>${won?'🎉 Fim do módulo!':'💔 Fim de jogo'}</h1><h2>${S.M.nome}: ${nivel}</h2>
  <p><b>${S.pts}</b> de ${max} pontos (${pct}%) · vidas restantes: ${S.lives}</p>
  ${tbl(['Fase','Tentativas','Pontos'],S.log.map(l=>[l.t,l.tries,l.gain]))}
  <p><b>Resumo:</b> ${S.M.sum}</p>
  <button class="big" onclick="play(${MODS.indexOf(S.M)})">Jogar de novo 🔁</button> <button class="big" onclick="menu()">☰ Menu</button></div>`;
}
menu();
