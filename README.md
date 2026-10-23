# Mestre do SQL

Aplicação interativa para aprender conceitos de MySQL por meio de perguntas e desafios. O conteúdo está em português e roda diretamente no navegador, sem instalação de dependências.

## Como executar

Abra o arquivo `index.html` em um navegador. Escolha um módulo no menu e responda às questões. O progresso é apresentado por pontuação e vidas; o recorde de cada módulo é atualizado a cada resposta correta e guardado no `localStorage` do navegador, inclusive se a partida for interrompida.

## Módulos

- **SELECT básico:** colunas, `WHERE`, `ORDER BY`, `LIMIT`, `DISTINCT` e `LIKE`.
- **INSERT, UPDATE e DELETE:** alteração de dados e uso seguro de filtros.
- **JOINs:** `INNER`, `LEFT`, `RIGHT`, `CROSS`, anti-join e simulação de `FULL OUTER JOIN` com `UNION`.
- **Funções de agregação:** `COUNT`, `SUM`, `AVG`, `MIN`, `MAX` e tratamento de `NULL`.
- **GROUP BY e HAVING:** agrupamento, filtros de linhas e grupos, e combinação com `JOIN`.
- **Subconsultas, CASE e funções:** subconsultas, `CASE WHEN`, `IFNULL`, `UPPER`, `ROUND` e outras funções.

As consultas são apresentadas com tabelas de exemplo e explicações após cada resposta.

## Estrutura

```text
.
├── index.html
├── css/
│   └── style.css
├── img/
└── js/
    └── app.js
```

A pasta `img/` está reservada para imagens estáticas. Atualmente, os ícones são emojis e o diagrama de JOIN é gerado em SVG pelo JavaScript.
