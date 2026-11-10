// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * Versioned prompts. Changing what a prompt asks means a new version (v2…), so a reading can
 * always be traced to the words that produced it. The model sees the categories by id.
 */
import { CATEGORIES } from '../../domain/categories';

const categoryList = CATEGORIES.map((category) => `- ${category.id}: ${category.label}`).join('\n');

const lineRules = `Para cada produto alimentar:
- "name": nome claro em português de Portugal, como se diz em casa ("Iogurte natural", "Peito de frango"). Expande abreviaturas. Sem marca, a menos que seja o que identifica o produto.
- "category": uma das categorias abaixo (o id), ou null se nenhuma servir.
- "quantity" e "unit": quantas unidades se compraram (ex.: 2 e "un"; "4X125G" é 4 e "un"), ou o peso quando se vende ao quilo (ex.: 0.85 e "kg"). O tamanho da embalagem ("1L", "400G") não é quantidade. Se não for claro, null. Nunca inventes.
- "perishable": true para o que se estraga em dias ou semanas (frescos, lacticínios, carne, peixe, pão, fruta, legumes, refeições prontas, congelados); false para despensa de longa duração (arroz, massa, enlatados, azeite, café, bebidas não lácteas).

Abreviaturas comuns nos talões: M/G meio-gordo, M/D magro/desnatado, NAT natural, PESC pescada, FIL filetes, FGO/FRANGO frango, PER peru, POR porco, BOV bovino, QJ queijo, FIAMB fiambre, IOG iogurte, LIQ líquido, CONG congelado, EMB embalagem, UN unidade, INTEG integral.

Categorias:
${categoryList}`;

export const RECEIPT_PROMPT = {
  version: 'receipt.v2',
  system: `Lês talões de supermercados portugueses e devolves só JSON segundo o esquema dado. Não escreves mais nada.`,
  prompt: `Lê o talão da imagem.
- "store": nome da loja (ex.: "Continente", "Pingo Doce", "Lidl"), ou null.
- "date": data da compra em AAAA-MM-DD, ou null se não se ler.
- "lines": uma entrada por produto alimentar ou bebida. Ignora sacos, descontos, cartões, talões de desconto, totais, IVA, pagamentos e artigos que não são comida.
- "raw": o texto do produto tal como está impresso no talão, sem o preço.

${lineRules}`,
};

export const VOICE_PROMPT = {
  version: 'voice.v2',
  system: `Transformas o que alguém disse sobre compras de comida numa lista, e devolves só JSON segundo o esquema dado.`,
  prompt: (transcript: string, today: string) => `Hoje é ${today} (AAAA-MM-DD). A pessoa disse:
"""
${transcript}
"""

Faz uma entrada por produto mencionado.
- "expires_at": só se a pessoa disser a validade desse produto ("o leite acaba dia 20", "o frango é até sexta"), convertida para AAAA-MM-DD a partir de hoje; senão null.

${lineRules}`,
};

export const DATE_PROMPT = {
  version: 'date.v1',
  system: `Lês a data de validade impressa em embalagens de comida e devolves só JSON segundo o esquema dado.`,
  prompt: (today: string) => `Hoje é ${today}. Lê a data de validade da embalagem na imagem.
- Formatos comuns: 12/11/26, 12.11.2026, 12 NOV 2026, 12-11. Num ano com dois dígitos, 26 é 2026.
- Se só houver mês e ano ("11/2026", "NOV 26"), usa o último dia desse mês.
- Se houver várias datas, escolhe a que vem junto de "Consumir até", "Consumir de preferência antes de", "Val.", "EXP" ou "BB", nunca a de fabrico ("Fab.", "Emb.", lote).
- "date": AAAA-MM-DD, ou null se não houver uma data legível.
- "kind": "consumir_ate" (perecível, data limite), "consumir_de_preferencia" ou "desconhecido".`,
};

export const TEST_PROMPT = {
  version: 'test.v1',
  system: 'Devolves só JSON segundo o esquema dado.',
  prompt: 'Responde com {"ok": true}.',
};

export const RECIPES_PROMPT = {
  version: 'recipes.v3',
  system: `Sugeres receitas caseiras simples, à portuguesa, para aproveitar alimentos que estão a acabar a validade. Escreves em português europeu e devolves só JSON segundo o esquema dado.`,
  prompt: (
    items: { name: string; days: number }[],
  ) => `Alimentos a aproveitar (dias até acabar a validade; negativo = já passou):
${items.map((item) => `- ${item.name} (${item.days})`).join('\n')}

Sugere entre 2 e 3 receitas para uma refeição de hoje (almoço ou jantar).
- Cada receita usa pelo menos um destes alimentos; dá prioridade aos que acabam primeiro.
- Receitas simples, de casa, com no máximo 45 minutos.
- Podes assumir que há em casa sal, pimenta, azeite, óleo, alho, cebola, água, farinha, açúcar, arroz e massa; põe em "falta" só o que não é isso nem está na lista (pouca coisa, ou nada).
- "usa" tem os nomes dos alimentos da lista que a receita usa, escritos como na lista.
- Passos curtos (no máximo 6), cada um uma frase, tratando a pessoa por tu ("Corta", "Junta", "Tempera").
- Títulos com maiúscula só na primeira letra ("Frango com espinafres").
- Não sugiras usar algo que já passou muito da validade se for carne, peixe ou lacticínio (mais de 1 dia): nesse caso ignora esse alimento.`,
};
