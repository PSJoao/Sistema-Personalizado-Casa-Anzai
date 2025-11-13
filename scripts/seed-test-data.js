// scripts/seed-test-data.js
// Popula o banco com produtos e pedidos de teste

require('dotenv').config();

const { randomUUID } = require('crypto');

const Product = require('../models/Product');
const MercadoLivreOrder = require('../models/MercadoLivreOrder');
const OrderItem = require('../models/OrderItem');

const TEST_PRODUCTS = Array.from({ length: 10 }).map((_, index) => {
  const codigo = 900001 + index;
  return {
    codigo,
    cod_fabrica: `SKU-${codigo}`,
    descricao: `Produto Teste ${index + 1}`,
    referencia: `PT-${codigo}`,
    unidade: 'UN',
    item_ativo: true,
    cod_grupo: 9900,
    grupo: 'GRUPO TESTE',
    cod_departamento: 22,
    departamento: 'PET',
    cod_marca: 9000 + index,
    marca: 'Marca Teste',
    cod_fornecedor: 8000 + index,
    fornecedor: 'Fornecedor Teste',
    nivel_de_giro: 'A',
    preco_custo_ultima_compra: 50 + index * 5,
    ativo: true,
    ativo_compra: true,
    ite_precom_liq: 0,
    ipi_entrada: 0,
    frete: 0,
    valor_frete: 0,
    acrescimo_financeiro: 0,
    substituicao_tributaria: 0,
    diferencial_aliquota: 0,
    preco_custo: 50 + index * 5,
    icms_saida: 0,
    imposto_federal_entrada: 0,
    imposto_federal_saida: 0,
    despesas_operacionais: 0,
    boca_de_caixa: 0,
    preco_custo_real: 50 + index * 5,
    classificacao_ipi: '0000',
    abreviacao_fiscal: 'TESTE',
    abreviacao_pis: 'TESTE',
    abreviacao_cofins: 'TESTE',
    cest: '00.000.00',
    tipo_produto: 'mercadoria'
  };
});

function buildTestOrders() {
  const orders = [];
  const now = new Date();
  const importBatchId = randomUUID();

  for (let index = 0; index < 50; index += 1) {
    const product = TEST_PRODUCTS[index % TEST_PRODUCTS.length];
    const quantidade = (index % 5) + 1;
    const precoUnitario = 80 + (index % TEST_PRODUCTS.length) * 3;
    const total = precoUnitario * quantidade;

    orders.push({
      numero_venda: `TEST-ML-${1000 + index}`,
      data_venda: now,
      estado: 'pendente',
      descricao_status: 'Pendente',
      pacote_diversos_produtos: false,
      pertence_kit: false,
      unidades: quantidade,
      receita_produtos: total,
      receita_acrescimo: 0,
      taxa_parcelamento_acrescimo: 0,
      tarifa_venda_impostos: 0,
      receita_envio: 0,
      tarifas_envio: 0,
      cancelamentos_reembolsos: 0,
      total,
      mes_faturamento_tarifas: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      venda_publicidade: 'Não',
      sku: String(product.codigo),
      numero_anuncio: `AN-${product.codigo}`,
      canal_venda: 'Mercado Livre',
      loja_oficial: 'Casa Anzai',
      titulo_anuncio: product.descricao,
      variacao: '',
      preco_unitario: precoUnitario,
      tipo_anuncio: 'Clássico',
      nfe_anexo: false,
      dados_pessoais_empresa: 'Casa Anzai LTDA',
      documento: '00000000000000',
      endereco: 'Rua Teste, 123',
      tipo_contribuinte: 'ISENTO',
      inscricao_estadual: 'ISENTO',
      comprador: `Cliente Teste ${index + 1}`,
      negocio: 'B2C',
      cpf: '00000000000',
      endereco_entrega: 'Rua Teste, 123',
      cidade: 'São Paulo',
      estado_entrega: 'SP',
      cep: '00000000',
      pais: 'BR',
      status_bucket: 'pendente',
      plataforma: 'mercado_livre',
      import_batch_id: importBatchId,
      arquivo_original: 'seed-test-data',
      uploaded_by: 1,
      uploaded_at: now
    });
  }

  return orders;
}

async function seed() {
  try {
    console.log('[Seed] Inserindo produtos de teste...');
    const productResult = await Product.bulkUpsert(TEST_PRODUCTS);
    console.log('[Seed] Produtos -> inseridos:', productResult.inserted, 'atualizados:', productResult.updated);

    const orders = buildTestOrders();
    console.log('[Seed] Inserindo pedidos Mercado Livre de teste...');
    const orderResult = await MercadoLivreOrder.bulkUpsert(orders);
    console.log('[Seed] Pedidos -> inseridos:', orderResult.inserted, 'atualizados:', orderResult.updated);

    const orderIdMap = new Map();
    orderResult.records.forEach((record, index) => {
      // Como o bulkUpsert retorna na mesma ordem, amarramos usando o array original
      const order = orders[index];
      orderIdMap.set(order.numero_venda, { id: record.id, order });
    });

    const orderItems = orders.map((order) => {
      const produtoCodigo = Number(order.sku);
      const orderInfo = orderIdMap.get(order.numero_venda);

      return {
        order_id: orderInfo?.id,
        produto_codigo: produtoCodigo,
        sku: order.sku,
        descricao_produto: order.titulo_anuncio,
        quantidade_total: order.unidades,
        quantidade_separada: 0,
        status: 'pendente'
      };
    }).filter((item) => item.order_id && item.produto_codigo);

    console.log('[Seed] Inserindo vínculos pedido-produto...');
    const orderItemsResult = await OrderItem.bulkUpsert(orderItems);
    console.log('[Seed] Order items -> inseridos:', orderItemsResult.inserted, 'atualizados:', orderItemsResult.updated);

    console.log('[Seed] Concluído com sucesso.');
    process.exit(0);
  } catch (error) {
    console.error('[Seed] Erro ao popular dados de teste:', error);
    process.exit(1);
  }
}

seed();

