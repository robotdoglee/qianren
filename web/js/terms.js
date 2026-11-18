// 中英学术术语词典 + 停用词 + 线索词表（纯数据与纯函数，不碰 DOM）

export const TERMS = [
  ['大语言模型', 'large language model'],
  ['多模态大模型', 'multimodal large language model'],
  ['视觉语言模型', 'vision-language model'],
  ['检索增强生成', 'retrieval-augmented generation'],
  ['参数高效微调', 'parameter-efficient fine-tuning'],
  ['自动语音识别', 'automatic speech recognition'],
  ['命名实体识别', 'named entity recognition'],
  ['深度强化学习', 'deep reinforcement learning'],
  ['生成对抗网络', 'generative adversarial network'],
  ['变分自编码器', 'variational autoencoder'],
  ['密度泛函理论', 'density functional theory'],
  ['时序预测', 'time series forecasting'],
  ['时间序列', 'time series'],
  ['大模型', 'large language model'],
  ['语言模型', 'language model'],
  ['多模态', 'multimodal'],
  ['幻觉', 'hallucination'],
  ['检索增强', 'retrieval-augmented generation'],
  ['提示工程', 'prompt engineering'],
  ['提示', 'prompting'],
  ['指令微调', 'instruction tuning'],
  ['微调', 'fine-tuning'],
  ['低秩适配', 'low-rank adaptation'],
  ['知识蒸馏', 'knowledge distillation'],
  ['强化学习', 'reinforcement learning'],
  ['联邦学习', 'federated learning'],
  ['自监督学习', 'self-supervised learning'],
  ['半监督学习', 'semi-supervised learning'],
  ['无监督学习', 'unsupervised learning'],
  ['对比学习', 'contrastive learning'],
  ['迁移学习', 'transfer learning'],
  ['度量学习', 'metric learning'],
  ['元学习', 'meta-learning'],
  ['多任务学习', 'multi-task learning'],
  ['课程学习', 'curriculum learning'],
  ['主动学习', 'active learning'],
  ['在线学习', 'online learning'],
  ['增量学习', 'incremental learning'],
  ['多智能体', 'multi-agent'],
  ['智能体', 'agent'],
  ['思维链', 'chain-of-thought'],
  ['推理', 'reasoning'],
  ['规划', 'planning'],
  ['工具使用', 'tool use'],
  ['向量数据库', 'vector database'],
  ['嵌入', 'embedding'],
  ['文本表示', 'text representation'],
  ['语义匹配', 'semantic matching'],
  ['稀疏检索', 'sparse retrieval'],
  ['稠密检索', 'dense retrieval'],
  ['重排序', 're-ranking'],
  ['检索', 'retrieval'],
  ['排序', 'ranking'],
  ['知识图谱', 'knowledge graph'],
  ['知识推理', 'knowledge reasoning'],
  ['信息抽取', 'information extraction'],
  ['关系抽取', 'relation extraction'],
  ['事件抽取', 'event extraction'],
  ['机器翻译', 'machine translation'],
  ['文本摘要', 'text summarization'],
  ['摘要生成', 'summarization'],
  ['问答系统', 'question answering'],
  ['问答', 'question answering'],
  ['情感分析', 'sentiment analysis'],
  ['文本分类', 'text classification'],
  ['语音识别', 'speech recognition'],
  ['光学字符识别', 'optical character recognition'],
  ['文档理解', 'document understanding'],
  ['代码生成', 'code generation'],
  ['程序合成', 'program synthesis'],
  ['推荐系统', 'recommender system'],
  ['自然语言处理', 'natural language processing'],
  ['计算机视觉', 'computer vision'],
  ['图像分类', 'image classification'],
  ['目标检测', 'object detection'],
  ['语义分割', 'semantic segmentation'],
  ['实例分割', 'instance segmentation'],
  ['病灶分割', 'lesion segmentation'],
  ['图像分割', 'image segmentation'],
  ['图像生成', 'image generation'],
  ['图像配准', 'image registration'],
  ['视频理解', 'video understanding'],
  ['三维重建', 'three-dimensional reconstruction'],
  ['点云', 'point cloud'],
  ['扩散模型', 'diffusion model'],
  ['注意力机制', 'attention mechanism'],
  ['图神经网络', 'graph neural network'],
  ['图表示学习', 'graph representation learning'],
  ['类别不平衡', 'class imbalance'],
  ['样本不均衡', 'class imbalance'],
  ['长尾', 'long-tail'],
  ['过拟合', 'overfitting'],
  ['欠拟合', 'underfitting'],
  ['泛化能力', 'generalization'],
  ['泛化', 'generalization'],
  ['可解释性', 'interpretability'],
  ['可解释', 'explainable'],
  ['鲁棒性', 'robustness'],
  ['鲁棒', 'robust'],
  ['对抗攻击', 'adversarial attack'],
  ['对抗样本', 'adversarial example'],
  ['数据增强', 'data augmentation'],
  ['特征工程', 'feature engineering'],
  ['差分隐私', 'differential privacy'],
  ['隐私保护', 'privacy preservation'],
  ['水印', 'watermarking'],
  ['深度伪造', 'deepfake'],
  ['医学影像', 'medical imaging'],
  ['医学图像', 'medical image'],
  ['医学问答', 'medical question answering'],
  ['临床决策', 'clinical decision making'],
  ['电子病历', 'electronic health records'],
  ['病理', 'pathology'],
  ['基因组', 'genomics'],
  ['单细胞', 'single-cell'],
  ['蛋白质结构', 'protein structure'],
  ['蛋白质', 'protein'],
  ['药物发现', 'drug discovery'],
  ['分子性质预测', 'molecular property prediction'],
  ['分子性质', 'molecular property prediction'],
  ['分子', 'molecule'],
  ['材料', 'materials'],
  ['晶体结构', 'crystal structure'],
  ['催化剂', 'catalyst'],
  ['电池', 'battery'],
  ['半导体', 'semiconductor'],
  ['高分子', 'polymer'],
  ['第一性原理', 'first-principles'],
  ['有限元', 'finite element'],
  ['分子动力学', 'molecular dynamics'],
  ['仿真', 'simulation'],
  ['数字孪生', 'digital twin'],
  ['控制系统', 'control system'],
  ['机器人', 'robotics'],
  ['路径规划', 'path planning'],
  ['自动驾驶', 'autonomous driving'],
  ['异常检测', 'anomaly detection'],
  ['故障诊断', 'fault diagnosis'],
  ['因果推断', 'causal inference'],
  ['因果发现', 'causal discovery'],
  ['贝叶斯', 'Bayesian'],
  ['概率图模型', 'probabilistic graphical model'],
  ['凸优化', 'convex optimization'],
  ['组合优化', 'combinatorial optimization'],
  ['优化', 'optimization'],
  ['调度', 'scheduling'],
  ['博弈论', 'game theory'],
  ['机制设计', 'mechanism design'],
  ['供应链', 'supply chain'],
  ['风险管理', 'risk management'],
  ['股票预测', 'stock prediction'],
  ['定价', 'pricing'],
  ['消费者行为', 'consumer behavior'],
  ['政策评估', 'policy evaluation'],
  ['流行病学', 'epidemiology'],
  ['神经影像', 'neuroimaging'],
  ['脑电', 'electroencephalogram'],
  ['生物信息学', 'bioinformatics'],
  ['准确率', 'accuracy'],
  ['召回率', 'recall'],
  ['精确率', 'precision'],
  ['消融实验', 'ablation study'],
  ['数据集', 'dataset'],
  ['基准测试', 'benchmark'],
  ['小样本', 'few-shot'],
  ['零样本', 'zero-shot'],
  ['困难样本', 'hard example mining']
];

export const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'by', 'at', 'as', 'is', 'are',
  'was', 'were', 'be', 'been', 'being', 'this', 'that', 'these', 'those', 'it', 'its', 'we', 'our',
  'from', 'can', 'will', 'would', 'should', 'could', 'may', 'might', 'do', 'does', 'did', 'have',
  'has', 'had', 'not', 'but', 'if', 'then', 'than', 'so', 'such', 'which', 'who', 'whom', 'their',
  'there', 'here', 'about', 'into', 'over', 'under', 'more', 'most', 'some', 'any', 'all', 'each',
  'other', 'another', 'between', 'among', 'via', 'using', 'used', 'use', 'based', 'also', 'very'
]);

const ZH_NOISE = ['我们', '我的', '一个', '如何', '怎么', '请问', '谢谢', '以及', '并且', '但是', '因为', '所以', '如果', '可以',
  '的', '了', '和', '与', '及', '在', '是', '我', '有', '对', '上', '下', '中', '个', '做', '能', '会', '这', '那', '就', '都',
  '把', '被', '给', '让', '使', '等', '要', '很', '吧', '呢', '啊'];

function stripNoise(run) {
  let out = run;
  for (const w of ZH_NOISE) out = out.split(w).join('');
  return out;
}

export const DATASETS = [
  'ImageNet', 'CIFAR-10', 'CIFAR-100', 'COCO', 'Pascal VOC', 'Open Images', 'ADE20K', 'Cityscapes',
  'SQuAD', 'Natural Questions', 'HotpotQA', 'TriviaQA', 'WebQuestions', 'MS MARCO', 'NQ',
  'XSum', 'CNN/Daily Mail', 'CNN&DailyMail', 'DailyMail', 'GLUE', 'MNLI', 'SNLI', 'AG News', 'Yelp',
  'WMT', 'MMLU', 'GSM8K', 'HumanEval', 'SWE-bench', 'LongBench', 'MATH', 'HellaSwag', 'TruthfulQA',
  'MedQA', 'PubMedQA', 'MIMIC-III', 'MIMIC-IV', 'MIMIC', 'MedMNIST', 'CheXpert', 'IU X-Ray',
  'ISIC', 'LUNA16', 'ADNI', 'BraTS', 'PathMNIST',
  'QM9', 'MoleculeNet', 'ZINC', 'USPTO', 'ChEMBL', 'Materials Project', 'OMAT',
  'OGB', 'OGBG', 'Cora', 'Citeseer', 'PubMed', 'ogbn',
  'Wikipedia', 'Common Crawl', 'C4', 'The Pile', 'RedPajama',
  'MovieLens', 'Amazon Reviews', 'YooChoose', 'UCI', 'MIMIC-CXR', 'KITTI', 'nuScenes', 'Waymo'
];

export const METRICS = [
  'accuracy', 'top-1 accuracy', 'top-5 accuracy', 'precision', 'recall', 'F1', 'F1-score', 'AUC',
  'AUROC', 'PR-AUC', 'BLEU', 'ROUGE-1', 'ROUGE-2', 'ROUGE-L', 'ROUGE', 'METEOR', 'BERTScore',
  'perplexity', 'MSE', 'RMSE', 'MAE', 'mAP', 'AP', 'IoU', 'Dice', 'NDCG', 'MRR', 'Hit Ratio',
  'HR@K', 'recall@k', 'ECE', 'calibration error', 'sensitivity', 'specificity', 'PPV', 'NPV',
  'Spearman', 'Pearson', 'CCC', 'edit distance', 'pass@1', 'pass@k', 'FID', 'CLIP score',
  'mean Average Precision', 'MAE', 'energy score'
];

export const CLUES = {
  question: [
    /\bwe (?:study|investigate|address|tackle|consider|focus on|are motivated by)\b/i,
    /\b(?:this|the) (?:paper|study|work|project) (?:aims|studies|investigates|addresses|proposes|presents|considers)\b/i,
    /\baim(?:s|ing)? (?:to|at)\b/i,
    /\b(?:goal|objective|purpose) (?:of|is)\b/i,
    /\b(?:problem|challenge|issue|question)\b/i,
    /\b(?:remains|remain) (?:a |an )?(?:difficult|hard|open|critical|challenging)\b/i,
    /\bdespite (?:the )?(?:great|significant|rapid|recent)\b/i
  ],
  method: [
    /\bwe (?:propose|present|introduce|develop|design|build|construct|formulate|adopt)\b/i,
    /\b(?:our|the proposed) (?:method|approach|framework|model|technique|pipeline|architecture|algorithm)\b/i,
    /\bis (?:proposed|presented|introduced|developed)\b/i,
    /\b(?:based on|via|through|by) (?:a|an|our|the)?\s?\w*(?:network|transformer|model|module|mechanism|strategy|scheme)\b/i,
    /\bwe (?:leverage|exploit|utilize|employ|use)\b/i
  ],
  result: [
    /\b(?:outperform[s|ed]?|surpass|beat[s]?|exceed)\b/i,
    /\b(?:improve|boost|increase|enhance|reduce|achiev\w*|obtain\w*|yield\w*)\b/i,
    /\bstate[- ]of[- ]the[- ]art\b/i,
    /\b\d+(?:\.\d+)?\s?(?:%|percent)\b/i,
    /\b\d+(?:\.\d+)?\s?(?:x|times|points|percentage points)\b/i,
    /\bexperimental results?\b/i
  ],
  limitation: [
    /\blimitation/i,
    /\bhowever\b/i,
    /\b(?:still|yet)\s+(?:fails|remains|struggles|suffers)/i,
    /\b(?:difficult|hard|challenging|ineffective|fails|suffers|struggle)\b/i,
    /\bfuture (?:work|research|direction)/i,
    /\b(?:drawback|trade-?off|caveat|shortcoming)/i,
    /\bmay not\b/i,
    /\bgeneraliz\w* (?:to|across)\b.*\b(?:remain|limited)/i
  ],
  datasetPrep: /\b(?:dataset|datasets|benchmark|benchmarks|corpus|corpora|train(?:ing)? set|test set|validation set|clinical notes|cohort)\b/i
};

export const METHOD_WORDS = [
  'retrieval-augmented', 'retrieval augmented', 'rag', 'prompting', 'prompt', 'chain-of-thought',
  'fine-tuning', 'fine-tune', 'instruction tuning', 'low-rank adaptation', 'lora', 'distillation',
  'reinforcement learning', 'rlhf', 'preference optimization', 'contrastive', 'self-supervised',
  'semi-supervised', 'few-shot', 'zero-shot', 'meta-learning', 'multi-task', 'curriculum',
  'active learning', 'graph neural network', 'gnn', 'transformer', 'attention', 'diffusion',
  'generative adversarial', 'autoencoder', 'variational', 'bayesian', 'causal', 'counterfactual',
  'ensemble', 'booster', 'resampling', 'oversampling', 're-weighting', 'reweighting',
  'focal loss', 'cost-sensitive', 'data augmentation', 'synthetic data', 'denoising',
  'knowledge graph', 'knowledge distillation', 'embedding', 'representation learning',
  'multi-agent', 'agent', 'planning', 'tool use', 'verification', 'self-consistency',
  'uncertainty', 'calibration', 'interpretability', 'explanation', 'saliency', 'probing',
  'segmentation', 'detection', 'classification', 'regression', 'forecasting', 'clustering',
  'ranking', 'reranking', 'federated', 'privacy', 'adversarial', 'robustness', 'quantization',
  'pruning', 'efficient', 'hierarchical', 'multimodal', 'vision-language', 'pretraining',
  'continual learning', 'domain adaptation', 'transfer learning', 'sampling', 'thresholding'
];

const TERM_MAP = new Map(TERMS);
const SORTED_ZH = TERMS.map(([zh]) => zh).sort((a, b) => b.length - a.length);

export function translateTerm(zh) {
  return TERM_MAP.get(zh) || null;
}

export function isChinese(text) {
  return /[\u4e00-\u9fff]/.test(text || '');
}

// 中文最长匹配切分：命中词典的词 + 未命中的连续中文字符（供兜底提示）
export function segmentChinese(text) {
  const s = text || '';
  const hits = [];
  const runs = [];
  let pending = '';
  let i = 0;
  while (i < s.length) {
    if (!/[\u4e00-\u9fff]/.test(s[i])) {
      if (pending) { runs.push(pending); pending = ''; }
      i += 1;
      continue;
    }
    let matched = null;
    for (const term of SORTED_ZH) {
      if (s.startsWith(term, i)) { matched = term; break; }
    }
    if (matched) {
      if (pending) { runs.push(pending); pending = ''; }
      hits.push(matched);
      i += matched.length;
    } else {
      pending += s[i];
      i += 1;
    }
  }
  if (pending) runs.push(pending);
  return { hits, rest: runs };
}

export function englishWords(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9+\-@/. ]+/g, ' ')
    .split(/[\s/,]+/)
    .map((w) => w.replace(/^[-.@]+|[-.@]+$/g, ''))
    .filter((w) => w.length > 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
}

// 输入 → 英文关键词（保序去重），并记录未命中词典的中文片段
export function keywords(text) {
  const { hits, rest } = segmentChinese(text);
  const out = [];
  for (const zh of hits) {
    const en = TERM_MAP.get(zh);
    if (en && !out.includes(en)) out.push(en);
  }
  for (const w of englishWords(text)) {
    if (!out.includes(w)) out.push(w);
  }
  const unmapped = rest.map(stripNoise).filter((run) => run.length >= 2);
  return { terms: out.slice(0, 8), unmapped };
}

function uniq(list) {
  return Array.from(new Set(list.filter(Boolean)));
}

// 规则法查询扩展：3–5 条英文检索式
export function buildQueries(text) {
  const { terms } = keywords(text);
  if (!terms.length) {
    const raw = (text || '').trim().replace(/\s+/g, ' ');
    return raw ? [raw] : [];
  }
  const core = terms.slice(0, 4);
  const tail = terms.slice(4, 6);
  const qs = [];
  qs.push(terms.slice(0, 6).join(' '));
  if (core.length >= 2) qs.push(`${core[0]} ${core[1]}`);
  if (core.length >= 3) qs.push(`${core[0]} ${core[2]}`);
  if (core.length >= 4) qs.push(`${core[1]} ${core[3]}`);
  if (tail.length) qs.push(`${core[0]} ${tail[0]}`);
  if (qs.length < 3) qs.push(core[core.length - 1]);
  return uniq(qs).slice(0, 5);
}

export function matchKnownDatasets(text) {
  const found = [];
  const lower = (text || '').toLowerCase();
  for (const d of DATASETS) {
    if (lower.includes(d.toLowerCase()) && !found.includes(d)) found.push(d);
  }
  return found;
}

export function matchKnownMetrics(text) {
  const found = [];
  const lower = (text || '').toLowerCase();
  for (const m of METRICS) {
    if (lower.includes(m.toLowerCase()) && !found.includes(m)) found.push(m);
  }
  return found;
}
