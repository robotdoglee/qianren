// 中英学术术语词典 + 停用词 + 线索词表（纯数据与纯函数，不碰 DOM）
//
// 免 key 模式的两条主线：
//  1) 中文：先去程度副词/虚词，再「最长匹配 + 逐位滑窗」查词典，命中即译成英文，
//     并把嵌在中文里的英文/数字缩写（CT、MRI、BERT、LLM、3D…）原样保留。
//  2) 英文：去停用词 + 识别常见英文短语（bigram/trigram）保持成短语。
// 仍未识别的中文片段留给上层提示。

export const TERMS = [
  // —— 大模型 / NLP ——
  ['大语言模型', 'large language model'],
  ['多模态大模型', 'multimodal large language model'],
  ['视觉语言模型', 'vision-language model'],
  ['视觉问答', 'visual question answering'],
  ['检索增强生成', 'retrieval-augmented generation'],
  ['检索增强', 'retrieval-augmented generation'],
  ['参数高效微调', 'parameter-efficient fine-tuning'],
  ['自动语音识别', 'automatic speech recognition'],
  ['语音识别', 'speech recognition'],
  ['命名实体识别', 'named entity recognition'],
  ['实体识别', 'entity recognition'],
  ['实体链接', 'entity linking'],
  ['深度强化学习', 'deep reinforcement learning'],
  ['生成对抗网络', 'generative adversarial network'],
  ['生成模型', 'generative model'],
  ['变分自编码器', 'variational autoencoder'],
  ['自编码器', 'autoencoder'],
  ['大模型', 'large language model'],
  ['语言模型', 'language model'],
  ['基础模型', 'foundation model'],
  ['预训练模型', 'pretrained model'],
  ['多模态', 'multimodal'],
  ['模态', 'modality'],
  ['幻觉', 'hallucination'],
  ['提示工程', 'prompt engineering'],
  ['提示学习', 'prompt learning'],
  ['提示', 'prompting'],
  ['思维链', 'chain-of-thought'],
  ['指令微调', 'instruction tuning'],
  ['微调', 'fine-tuning'],
  ['低秩适配', 'low-rank adaptation'],
  ['知识蒸馏', 'knowledge distillation'],
  ['蒸馏', 'distillation'],
  ['强化学习', 'reinforcement learning'],
  ['人类反馈强化学习', 'reinforcement learning from human feedback'],
  ['联邦学习', 'federated learning'],
  ['自监督学习', 'self-supervised learning'],
  ['半监督学习', 'semi-supervised learning'],
  ['无监督学习', 'unsupervised learning'],
  ['弱监督学习', 'weakly-supervised learning'],
  ['对比学习', 'contrastive learning'],
  ['迁移学习', 'transfer learning'],
  ['度量学习', 'metric learning'],
  ['元学习', 'meta-learning'],
  ['多任务学习', 'multi-task learning'],
  ['课程学习', 'curriculum learning'],
  ['主动学习', 'active learning'],
  ['在线学习', 'online learning'],
  ['增量学习', 'incremental learning'],
  ['持续学习', 'continual learning'],
  ['终身学习', 'lifelong learning'],
  ['多智能体', 'multi-agent'],
  ['智能体', 'agent'],
  ['推理', 'reasoning'],
  ['规划', 'planning'],
  ['工具调用', 'tool use'],
  ['工具使用', 'tool use'],
  ['向量数据库', 'vector database'],
  ['向量检索', 'vector retrieval'],
  ['嵌入', 'embedding'],
  ['表示学习', 'representation learning'],
  ['文本表示', 'text representation'],
  ['语义匹配', 'semantic matching'],
  ['语义检索', 'semantic retrieval'],
  ['稀疏检索', 'sparse retrieval'],
  ['稠密检索', 'dense retrieval'],
  ['重排序', 're-ranking'],
  ['检索', 'retrieval'],
  ['排序', 'ranking'],
  ['知识图谱', 'knowledge graph'],
  ['知识推理', 'knowledge reasoning'],
  ['知识补全', 'knowledge graph completion'],
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
  ['文本挖掘', 'text mining'],
  ['舆情分析', 'opinion mining'],
  ['主题模型', 'topic model'],
  ['词向量', 'word embedding'],
  ['句向量', 'sentence embedding'],
  ['文档理解', 'document understanding'],
  ['光学字符识别', 'optical character recognition'],
  ['字符识别', 'character recognition'],
  ['代码生成', 'code generation'],
  ['代码补全', 'code completion'],
  ['程序合成', 'program synthesis'],
  ['程序修复', 'program repair'],
  ['软件测试', 'software testing'],
  ['自然语言处理', 'natural language processing'],
  ['计算机视觉', 'computer vision'],
  ['对话系统', 'dialogue system'],
  ['机器阅读', 'machine reading comprehension'],
  ['阅读理解', 'reading comprehension'],
  ['自动摘要', 'automatic summarization'],
  ['信息检索', 'information retrieval'],

  // —— 视觉 / 图形 ——
  ['图像分类', 'image classification'],
  ['图像描述', 'image captioning'],
  ['目标检测', 'object detection'],
  ['行人重识别', 'person re-identification'],
  ['人脸检测', 'face detection'],
  ['人脸识别', 'face recognition'],
  ['语义分割', 'semantic segmentation'],
  ['实例分割', 'instance segmentation'],
  ['全景分割', 'panoptic segmentation'],
  ['病灶分割', 'lesion segmentation'],
  ['图像分割', 'image segmentation'],
  ['分割', 'segmentation'],
  ['图像生成', 'image generation'],
  ['图像配准', 'image registration'],
  ['图像修复', 'image inpainting'],
  ['图像去噪', 'image denoising'],
  ['图像超分辨率', 'image super-resolution'],
  ['图像', 'image'],
  ['超分辨率', 'super-resolution'],
  ['图像增强', 'image enhancement'],
  ['图像重建', 'image reconstruction'],
  ['三维重建', 'three-dimensional reconstruction'],
  ['点云', 'point cloud'],
  ['神经辐射场', 'neural radiance field'],
  ['扩散模型', 'diffusion model'],
  ['视频理解', 'video understanding'],
  ['视频生成', 'video generation'],
  ['动作识别', 'action recognition'],
  ['行为识别', 'behavior recognition'],
  ['姿态估计', 'pose estimation'],
  ['深度估计', 'depth estimation'],
  ['光流估计', 'optical flow'],
  ['跟踪', 'tracking'],
  ['目标跟踪', 'object tracking'],
  ['注意力机制', 'attention mechanism'],
  ['图神经网络', 'graph neural network'],
  ['图表示学习', 'graph representation learning'],
  ['图嵌入', 'graph embedding'],
  ['卷积神经网络', 'convolutional neural network'],
  ['循环神经网络', 'recurrent neural network'],
  ['神经网络', 'neural network'],
  ['深度学习', 'deep learning'],
  ['机器学习', 'machine learning'],

  // —— 分类 / 检测 / 预测 / 生成（通用组合词）——
  ['分类', 'classification'],
  ['分类器', 'classifier'],
  ['检测', 'detection'],
  ['识别', 'recognition'],
  ['预测', 'prediction'],
  ['生成', 'generation'],
  ['回归', 'regression'],
  ['聚类', 'clustering'],
  ['对抗', 'adversarial'],
  ['模型', 'model'],
  ['数据', 'dataset'],
  ['数据集', 'dataset'],
  ['标注', 'annotation'],
  ['分割模型', 'segmentation'],
  ['去噪', 'denoising'],
  ['低剂量', 'low-dose'],

  // —— 学习表现 / 评估 ——
  ['准确率', 'accuracy'],
  ['精确率', 'precision'],
  ['召回率', 'recall'],
  ['查全率', 'recall'],
  ['查准率', 'precision'],
  ['平均精度', 'mean average precision'],
  ['消融实验', 'ablation study'],
  ['基准测试', 'benchmark'],
  ['基线', 'baseline'],
  ['小样本', 'few-shot'],
  ['少样本', 'few-shot'],
  ['零样本', 'zero-shot'],
  ['单样本', 'one-shot'],
  ['困难样本', 'hard example mining'],
  ['困难负样本', 'hard negative mining'],
  ['类别不平衡', 'class imbalance'],
  ['类别不均衡', 'class imbalance'],
  ['样本不均衡', 'class imbalance'],
  ['数据不均衡', 'class imbalance'],
  ['少数类', 'minority class'],
  ['多数类', 'majority class'],
  ['长尾', 'long-tail'],
  ['长尾分布', 'long-tailed distribution'],
  ['过采样', 'oversampling'],
  ['欠采样', 'undersampling'],
  ['重采样', 'resampling'],
  ['过拟合', 'overfitting'],
  ['欠拟合', 'underfitting'],
  ['泛化能力', 'generalization'],
  ['泛化', 'generalization'],
  ['可解释性', 'interpretability'],
  ['可解释', 'explainable'],
  ['可解释人工智能', 'explainable artificial intelligence'],
  ['鲁棒性', 'robustness'],
  ['鲁棒', 'robust'],
  ['不确定性', 'uncertainty'],
  ['校准', 'calibration'],

  // —— 安全 / 隐私 ——
  ['对抗攻击', 'adversarial attack'],
  ['对抗样本', 'adversarial example'],
  ['对抗防御', 'adversarial defense'],
  ['数据增强', 'data augmentation'],
  ['特征工程', 'feature engineering'],
  ['特征选择', 'feature selection'],
  ['差分隐私', 'differential privacy'],
  ['隐私保护', 'privacy preserving'],
  ['联邦隐私', 'federated privacy'],
  ['水印', 'watermarking'],
  ['深度伪造', 'deepfake'],
  ['伪造检测', 'forgery detection'],
  ['恶意检测', 'malware detection'],
  ['入侵检测', 'intrusion detection'],
  ['欺诈检测', 'fraud detection'],
  ['区块链', 'blockchain'],
  ['共识算法', 'consensus algorithm'],
  ['边缘计算', 'edge computing'],
  ['云计算', 'cloud computing'],
  ['任务调度', 'task scheduling'],
  ['负载均衡', 'load balancing'],

  // —— AI 生成文本 / 检测 ——
  ['人工智能生成文本', 'AI-generated text'],
  ['AI生成文本', 'AI-generated text'],
  ['机器生成文本', 'machine-generated text'],
  ['生成文本检测', 'AI-generated text detection'],
  ['文本检测', 'text detection'],

  // —— 医学影像 ——
  ['医学影像', 'medical imaging'],
  ['医学图像', 'medical image'],
  ['医学影像分析', 'medical image analysis'],
  ['计算机辅助诊断', 'computer-aided diagnosis'],
  ['辅助诊断', 'computer-aided diagnosis'],
  ['断层扫描', 'tomography'],
  ['计算机断层扫描', 'computed tomography'],
  ['核磁共振', 'magnetic resonance imaging'],
  ['磁共振成像', 'magnetic resonance imaging'],
  ['超声', 'ultrasound'],
  ['X光', 'X-ray'],
  ['射线', 'radiograph'],
  ['病理图像', 'pathology image'],
  ['病理', 'pathology'],
  ['细胞病理', 'cytopathology'],
  ['放射学', 'radiology'],
  ['视网膜', 'retina'],
  ['眼底', 'fundus'],
  ['肿瘤', 'tumor'],
  ['癌症', 'cancer'],
  ['病变', 'lesion'],
  ['临床决策', 'clinical decision making'],
  ['电子病历', 'electronic health records'],
  ['医学问答', 'medical question answering'],
  ['医学文本', 'medical text'],
  ['临床文本', 'clinical text'],
  ['诊断', 'diagnosis'],
  ['分期', 'staging'],
  ['预后', 'prognosis'],
  ['神经影像', 'neuroimaging'],
  ['脑电', 'electroencephalogram'],
  ['脑机接口', 'brain-computer interface'],
  ['功能磁共振', 'functional magnetic resonance imaging'],

  // —— 生物医药 / 生化 ——
  ['基因组', 'genomics'],
  ['基因组学', 'genomics'],
  ['转录组', 'transcriptomics'],
  ['蛋白质组', 'proteomics'],
  ['单细胞', 'single-cell'],
  ['单细胞测序', 'single-cell sequencing'],
  ['测序', 'sequencing'],
  ['序列比对', 'sequence alignment'],
  ['基因表达', 'gene expression'],
  ['蛋白质结构', 'protein structure'],
  ['蛋白质结构预测', 'protein structure prediction'],
  ['蛋白质', 'protein'],
  ['蛋白折叠', 'protein folding'],
  ['药物发现', 'drug discovery'],
  ['药物设计', 'drug design'],
  ['药物靶点', 'drug target'],
  ['分子性质预测', 'molecular property prediction'],
  ['分子性质', 'molecular property prediction'],
  ['分子生成', 'molecular generation'],
  ['分子', 'molecule'],
  ['化学', 'chemistry'],
  ['材料', 'materials science'],
  ['材料科学', 'materials science'],
  ['晶体结构', 'crystal structure'],
  ['催化剂', 'catalyst'],
  ['催化', 'catalysis'],
  ['电池', 'battery'],
  ['固态电池', 'solid-state battery'],
  ['锂', 'lithium'],
  ['半导体', 'semiconductor'],
  ['高分子', 'polymer'],
  ['纳米', 'nanomaterial'],
  ['密度泛函理论', 'density functional theory'],
  ['第一性原理', 'first-principles'],
  ['分子动力学', 'molecular dynamics'],
  ['有限元', 'finite element'],
  ['药理学', 'pharmacology'],
  ['临床试验', 'clinical trial'],
  ['流行病学', 'epidemiology'],
  ['疾病预测', 'disease prediction'],

  // —— 时序 / 信号 ——
  ['时间序列', 'time series'],
  ['时序预测', 'time series forecasting'],
  ['时序分析', 'time series analysis'],
  ['信号处理', 'signal processing'],
  ['频谱', 'spectrum'],
  ['语音合成', 'speech synthesis'],
  ['文本转语音', 'text-to-speech'],
  ['说话人识别', 'speaker recognition'],

  // —— 推荐 / 图 / 数据挖掘 ——
  ['推荐系统', 'recommender system'],
  ['推荐', 'recommendation'],
  ['点击率预测', 'click-through rate prediction'],
  ['协同过滤', 'collaborative filtering'],
  ['社交网络', 'social network'],
  ['异常检测', 'anomaly detection'],
  ['离群检测', 'outlier detection'],
  ['故障诊断', 'fault diagnosis'],
  ['知识追踪', 'knowledge tracing'],

  // —— 因果 / 优化 / 概率 ——
  ['因果推断', 'causal inference'],
  ['因果发现', 'causal discovery'],
  ['因果效应', 'causal effect'],
  ['反事实', 'counterfactual'],
  ['贝叶斯', 'Bayesian'],
  ['概率图模型', 'probabilistic graphical model'],
  ['凸优化', 'convex optimization'],
  ['组合优化', 'combinatorial optimization'],
  ['优化', 'optimization'],
  ['调度', 'scheduling'],
  ['博弈论', 'game theory'],
  ['机制设计', 'mechanism design'],
  ['多臂老虎机', 'multi-armed bandit'],
  ['纳什均衡', 'Nash equilibrium'],

  // —— 机器人 / 控制 / 自动驾驶 ——
  ['机器人', 'robotics'],
  ['路径规划', 'path planning'],
  ['运动规划', 'motion planning'],
  ['自动驾驶', 'autonomous driving'],
  ['无人驾驶', 'autonomous driving'],
  ['强化控制', 'reinforcement control'],
  ['控制系统', 'control system'],
  ['数字孪生', 'digital twin'],
  ['仿真', 'simulation'],
  ['SLAM', 'simultaneous localization and mapping'],
  ['同步定位与建图', 'simultaneous localization and mapping'],
  ['无人机', 'unmanned aerial vehicle'],

  // —— 遥感 / 地理 / 环境 ——
  ['遥感', 'remote sensing'],
  ['遥感图像', 'remote sensing image'],
  ['地理信息', 'geographic information system'],
  ['土地覆盖', 'land cover'],
  ['气候变化', 'climate change'],
  ['碳排放', 'carbon emission'],
  ['碳捕集', 'carbon capture'],
  ['空气质量', 'air quality'],
  ['水质', 'water quality'],
  ['污染物', 'pollutant'],
  ['生态系统', 'ecosystem'],
  ['太阳能', 'solar energy'],
  ['风能', 'wind energy'],
  ['新能源', 'renewable energy'],

  // —— 经管社科 ——
  ['供应链', 'supply chain'],
  ['风险管理', 'risk management'],
  ['股票预测', 'stock prediction'],
  ['金融', 'finance'],
  ['量化交易', 'quantitative trading'],
  ['定价', 'pricing'],
  ['消费者行为', 'consumer behavior'],
  ['政策评估', 'policy evaluation'],
  ['社会网络', 'social network'],
  ['计算社会科学', 'computational social science'],
  ['舆情', 'public opinion'],
  ['计量经济', 'econometrics'],

  // —— 教育 ——
  ['学生作文', 'student essay'],
  ['作文自动评分', 'automated essay scoring'],
  ['自动评分', 'automated scoring'],
  ['在线教育', 'online education'],
  ['智慧教育', 'smart education'],
  ['教育挖掘', 'educational data mining'],
  ['学习分析', 'learning analytics'],
  ['智能导学', 'intelligent tutoring system'],
  ['自适应学习', 'adaptive learning'],
  ['学生评估', 'student assessment'],

  // —— 更多常见 AI/CS 术语 ——
  ['量化', 'quantization'],
  ['剪枝', 'pruning'],
  ['稀疏化', 'sparsity'],
  ['高效推理', 'efficient inference'],
  ['模型压缩', 'model compression'],
  ['知识图谱嵌入', 'knowledge graph embedding'],
  ['多任务', 'multi-task'],
  ['流水线', 'pipeline'],
  ['端到端', 'end-to-end'],
  ['自监督', 'self-supervised'],
  ['半监督', 'semi-supervised'],
  ['弱监督', 'weakly-supervised'],
  ['多视角', 'multi-view'],
  ['域适应', 'domain adaptation'],
  ['领域自适应', 'domain adaptation'],
  ['分布外', 'out-of-distribution'],
  ['分布外检测', 'out-of-distribution detection'],
  ['主动学习采样', 'active learning'],
  ['集成学习', 'ensemble learning'],
  ['集成', 'ensemble'],
  ['随机森林', 'random forest'],
  ['梯度提升', 'gradient boosting'],
  ['支持向量机', 'support vector machine'],
  ['决策树', 'decision tree'],
  ['主成分分析', 'principal component analysis'],
  ['降维', 'dimensionality reduction'],
  ['聚类分析', 'cluster analysis'],
  ['贝叶斯网络', 'Bayesian network'],
  ['马尔可夫决策过程', 'Markov decision process'],
  ['多目标优化', 'multi-objective optimization'],
  ['超参数', 'hyperparameter'],
  ['交叉验证', 'cross-validation'],
  ['可微分编程', 'differentiable programming'],
  ['神经架构搜索', 'neural architecture search'],
  ['元数据', 'metadata'],
  ['语义分割网络', 'semantic segmentation'],
  ['编码器', 'encoder'],
  ['解码器', 'decoder'],
  ['编解码', 'encoder-decoder'],
  ['掩码', 'mask'],
  ['注意力', 'attention'],
  ['自注意力', 'self-attention'],
  ['多头注意力', 'multi-head attention'],
  ['残差', 'residual'],
  ['归一化', 'normalization'],
  ['批归一化', 'batch normalization'],
  ['正则化', 'regularization'],
  ['损失函数', 'loss function'],
  ['梯度下降', 'gradient descent'],
  ['收敛', 'convergence'],
  ['可训练', 'trainable'],
  ['微调策略', 'fine-tuning'],
  ['对齐', 'alignment'],
  ['偏好对齐', 'preference alignment'],
  ['安全对齐', 'safety alignment'],
  ['价值观对齐', 'value alignment'],
  ['红队', 'red teaming'],
  ['越狱', 'jailbreak'],
  ['越狱攻击', 'jailbreak attack'],
  ['毒性检测', 'toxicity detection'],
  ['偏见', 'bias'],
  ['公平性', 'fairness'],
  ['可迁移性', 'transferability'],
  ['可复现性', 'reproducibility'],
  ['因果表示学习', 'causal representation learning'],
  ['世界模型', 'world model'],
  ['扩散概率模型', 'diffusion probabilistic model'],
  ['流模型', 'normalizing flow'],
  ['能量模型', 'energy-based model'],
  ['对比语言图像预训练', 'contrastive language-image pretraining'],
  ['零样本检测', 'zero-shot detection'],
  ['开放词汇', 'open-vocabulary'],
  ['分割一切', 'segment anything'],
  ['视觉提示', 'visual prompt'],
  ['少样本分割', 'few-shot segmentation'],
  ['显著性检测', 'saliency detection'],
  ['场景理解', 'scene understanding'],
  ['文档智能', 'document intelligence'],
  ['表格识别', 'table recognition'],
  ['公式识别', 'formula recognition'],
  ['手写识别', 'handwriting recognition'],
  ['图挖掘', 'graph mining'],
  ['图匹配', 'graph matching'],
  ['时空预测', 'spatio-temporal forecasting'],
  ['时空图', 'spatio-temporal graph'],
  ['交通预测', 'traffic prediction'],
  ['轨迹预测', 'trajectory prediction'],
  ['语音增强', 'speech enhancement'],
  ['音乐生成', 'music generation'],
  ['跨模态检索', 'cross-modal retrieval'],
  ['多语言', 'multilingual'],
  ['低资源语言', 'low-resource language'],
  ['方言', 'dialect'],
  ['数据标注', 'data annotation'],
  ['主动学习标注', 'active labeling'],
  ['合成数据', 'synthetic data'],
  ['数据泄露', 'data leakage'],
  ['在线广告', 'online advertising'],
  ['拍卖', 'auction'],
  ['竞价', 'bidding'],
  ['用户建模', 'user modeling'],
  ['冷启动', 'cold start'],
  ['序列推荐', 'sequential recommendation'],
  ['图推荐', 'graph-based recommendation'],
  ['去偏', 'debiasing'],
  ['可微搜索', 'differentiable search'],
  ['长上下文', 'long context'],
  ['上下文学习', 'in-context learning'],
  ['链式思考', 'chain-of-thought'],
  ['自我一致性', 'self-consistency'],
  ['思考树', 'tree-of-thought'],
  ['智能体系统', 'agentic system'],
  ['多智能体系统', 'multi-agent system'],
  ['规划器', 'planner'],
  ['记忆机制', 'memory mechanism'],
  ['工具增强', 'tool-augmented'],
  ['函数调用', 'function calling'],
  ['结构化输出', 'structured output'],
  ['代码智能体', 'code agent'],
  ['检索器', 'retriever'],
  ['语料库', 'corpus'],
  ['文档索引', 'document indexing'],
  ['分块', 'chunking'],
  ['混合检索', 'hybrid retrieval'],
  ['生成器', 'generator'],
  ['判别器', 'discriminator'],
  ['评分模型', 'reward model'],
  ['奖励模型', 'reward model'],
  ['偏好优化', 'preference optimization'],
  ['直接偏好优化', 'direct preference optimization'],
  ['指令跟随', 'instruction following'],
  ['多轮对话', 'multi-turn dialogue'],
  ['任务型对话', 'task-oriented dialogue'],
  ['对话状态跟踪', 'dialogue state tracking'],
  ['意图识别', 'intent detection'],
  ['槽位填充', 'slot filling'],
  ['知识编辑', 'knowledge editing'],
  ['知识注入', 'knowledge injection'],
  ['事实性', 'factuality'],
  ['实体抽取', 'entity extraction'],
  ['关系预测', 'relation prediction'],
  ['图补全', 'link prediction'],
  ['链路预测', 'link prediction'],
  ['社区发现', 'community detection'],
  ['图分类', 'graph classification'],
  ['图生成', 'graph generation'],
  ['异构图', 'heterogeneous graph'],
  ['时空图神经网络', 'spatio-temporal graph neural network'],
  ['消息传递', 'message passing'],
  ['图卷积网络', 'graph convolutional network'],
  ['知识图谱问答', 'knowledge graph question answering'],
  ['语义网络', 'semantic network'],
  ['本体', 'ontology'],
  ['实体对齐', 'entity alignment'],
  ['跨语言', 'cross-lingual'],
  ['预训练语言模型', 'pretrained language model'],
  ['掩码语言模型', 'masked language model'],
  ['自回归', 'autoregressive'],
  ['序列到序列', 'sequence-to-sequence'],
  ['束搜索', 'beam search'],
  ['采样策略', 'sampling strategy'],
  ['温度采样', 'temperature sampling'],
  ['解码策略', 'decoding strategy'],
  ['长尾识别', 'long-tail recognition'],
  ['标签噪声', 'label noise'],
  ['噪声标签学习', 'learning with noisy labels'],
  ['部分标注', 'partial labeling'],
  ['互补学习', 'complementary learning'],
  ['多标签分类', 'multi-label classification'],
  ['多类分类', 'multi-class classification'],
  ['层次分类', 'hierarchical classification'],
  ['零样本学习', 'zero-shot learning'],
  ['小样本学习', 'few-shot learning'],
  ['样本效率', 'sample efficiency'],
  ['隐私攻击', 'privacy attack'],
  ['成员推断攻击', 'membership inference attack'],
  ['模型窃取', 'model extraction'],
  ['后门攻击', 'backdoor attack'],
  ['投毒攻击', 'data poisoning'],
  ['水印鲁棒性', 'robust watermarking'],
  ['公平性约束', 'fairness constraint'],
  ['可解释推理', 'interpretable reasoning'],
  ['注意力可视化', 'attention visualization'],
  ['特征归因', 'feature attribution'],
  ['显著性图', 'saliency map'],
  ['反事实解释', 'counterfactual explanation'],
  ['模型诊断', 'model diagnosis'],
  ['性能退化', 'performance degradation'],
  ['灾难性遗忘', 'catastrophic forgetting'],
  ['弹性权重固化', 'elastic weight consolidation'],
  ['原型网络', 'prototypical network'],
  ['度量指标', 'evaluation metric'],
  ['置信区间', 'confidence interval'],
  ['统计显著性', 'statistical significance'],
  ['多重检验', 'multiple testing'],
  ['假设检验', 'hypothesis testing'],
  ['极大似然估计', 'maximum likelihood estimation'],
  ['期望最大化', 'expectation maximization'],
  ['变分推断', 'variational inference'],
  ['马尔可夫链蒙特卡洛', 'Markov chain Monte Carlo'],
  ['高斯过程', 'Gaussian process'],
  ['核方法', 'kernel method'],
  ['支持向量', 'support vector'],
  ['随机投影', 'random projection'],
  ['近似最近邻', 'approximate nearest neighbor'],
  ['向量索引', 'vector index'],
  ['倒排索引', 'inverted index'],
  ['稀疏表示', 'sparse representation'],
  ['字典学习', 'dictionary learning'],
  ['矩阵分解', 'matrix factorization'],
  ['张量分解', 'tensor factorization'],
  ['低秩近似', 'low-rank approximation'],
  ['鲁棒优化', 'robust optimization'],
  ['鲁棒回归', 'robust regression'],
  ['加权损失', 'weighted loss'],
  ['重加权', 're-weighting'],
  ['焦点损失', 'focal loss'],
  ['代价敏感', 'cost-sensitive'],
  ['类平衡', 'class-balanced'],
  ['标签平滑', 'label smoothing'],
  ['混合精度', 'mixed precision'],
  ['分布式训练', 'distributed training'],
  ['梯度累积', 'gradient accumulation'],
  ['显存优化', 'memory optimization'],
  ['模型并行', 'model parallelism'],
  ['数据并行', 'data parallelism'],
  ['流水线并行', 'pipeline parallelism'],
  ['推理加速', 'inference acceleration'],
  ['高效微调', 'parameter-efficient fine-tuning'],
  ['适配器', 'adapter'],
  ['前缀微调', 'prefix-tuning'],
  ['参数高效', 'parameter-efficient'],
  ['视觉Transformer', 'vision transformer'],
  ['视觉变换器', 'vision transformer'],
  ['目标跟踪网络', 'object tracking'],
  ['医学图像分割', 'medical image segmentation'],
  ['医学图像分类', 'medical image classification'],
  ['肺结节', 'pulmonary nodule'],
  ['结节检测', 'nodule detection'],
  ['肿瘤分割', 'tumor segmentation'],
  ['器官分割', 'organ segmentation'],
  ['细胞分割', 'cell segmentation'],
  ['染色', 'staining'],
  ['全切片图像', 'whole slide image'],
  ['病理诊断', 'pathological diagnosis'],
  ['放射组学', 'radiomics'],
  ['基因组学分析', 'genomic analysis'],
  ['低剂量计算机断层扫描', 'low-dose computed tomography'],
  ['降噪', 'noise reduction'],
  ['重建算法', 'reconstruction'],
  ['伪影', 'artifact'],
  ['剂量', 'radiation dose'],
  ['对比度', 'contrast'],
  ['配准误差', 'registration'],
  ['迁移', 'transfer'],
  ['知识迁移', 'knowledge transfer'],
  ['跨域', 'cross-domain'],
  ['源域', 'source domain'],
  ['目标域', 'target domain'],
  ['域泛化', 'domain generalization'],
  ['特征对齐', 'feature alignment'],
  ['对抗训练', 'adversarial training'],
  ['对抗鲁棒', 'adversarial robustness'],
  ['认证鲁棒性', 'certified robustness'],
  ['梯度掩码', 'gradient masking']
];

// 英文输入需过滤的停用词（含 question / method 类虚词）
export const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'by', 'at', 'as', 'is', 'are',
  'was', 'were', 'be', 'been', 'being', 'this', 'that', 'these', 'those', 'it', 'its', 'we', 'our',
  'from', 'can', 'will', 'would', 'should', 'could', 'may', 'might', 'do', 'does', 'did', 'have',
  'has', 'had', 'not', 'but', 'if', 'then', 'than', 'so', 'such', 'which', 'who', 'whom', 'their',
  'there', 'here', 'about', 'into', 'over', 'under', 'more', 'most', 'some', 'any', 'all', 'each',
  'other', 'another', 'between', 'among', 'via', 'using', 'used', 'use', 'based', 'also', 'very',
  // —— 扩展：疑问词 / 程度词 / 元话语 ——
  'how', 'what', 'when', 'where', 'why', 'whether', 'while', 'whose', 'whom', 'whichever',
  'my', 'me', 'mine', 'your', 'yours', 'his', 'her', 'hers', 'them', 'they', 'theirs', 'us',
  'i', 'you', 'he', 'she', 'am', 'are', 'was', 'were', 'been', 'being', 'having', 'has', 'have', 'had',
  'approach', 'approaches', 'method', 'methods', 'methodology', 'technique', 'techniques',
  'novel', 'new', 'towards', 'toward', 'study', 'studies', 'studing', 'paper', 'papers',
  'work', 'works', 'article', 'report', 'goal', 'aim', 'aims', 'want', 'wanna', 'need', 'needs',
  'make', 'makes', 'made', 'let', 'lets', 'help', 'helps', 'try', 'tries', 'want', 'like',
  'thing', 'things', 'stuff', 'way', 'ways', 'thing', 'lot', 'lots', 'bit', 'kind', 'kinds',
  'extremely', 'highly', 'greatly', 'significantly', 'particularly', 'especially', 'really',
  'just', 'quite', 'rather', 'fairly', 'somewhat', 'almost', 'nearly', 'much', 'many',
  'problem', 'problems', 'issue', 'issues', 'challenge', 'challenges',
  'result', 'results', 'solution', 'solutions', 'idea', 'ideas', 'case', 'cases', 'aspect',
  'good', 'bad', 'well', 'better', 'best', 'worse', 'worst', 'high', 'small',
  'big', 'few', 'little', 'least', 'less', 'enough', 'too', 'both', 'either', 'neither',
  'get', 'gets', 'got', 'put', 'puts', 'take', 'takes', 'took', 'given', 'give', 'gives',
  'one', 'two', 'three', 'first', 'second', 'third', 'etc', 'eg', 'ie', 'vs', 'versus',
  'our', 'its', 'him', 'd', 'll', 're', 've', 's', 't'
]);

// 常见英文短语 / 二元词组，识别后保持成短语（大小写归一化为规范形）
export const EN_PHRASES = [
  'AI-generated text', 'machine-generated text', 'synthetic text', 'generated text',
  'student essay', 'student essays', 'automated essay scoring', 'online education',
  'class imbalance', 'imbalanced classification', 'minority class', 'long-tail recognition',
  'low-dose CT', 'low dose CT', 'image denoising', 'denoising diffusion', 'medical imaging',
  'graph neural network', 'graph neural networks', 'few-shot learning', 'few-shot segmentation',
  'zero-shot learning', 'retrieval-augmented generation', 'large language model',
  'language model', 'question answering', 'medical question answering', 'knowledge graph',
  'computer vision', 'natural language processing', 'reinforcement learning', 'transfer learning',
  'contrastive learning', 'self-supervised learning', 'semi-supervised learning', 'federated learning',
  'knowledge distillation', 'fine-tuning', 'prompt tuning', 'prompt learning', 'chain-of-thought',
  'object detection', 'semantic segmentation', 'image classification', 'speech recognition',
  'time series', 'time series forecasting', 'anomaly detection', 'recommendation system',
  'recommender system', 'causal inference', 'differential privacy', 'adversarial attack',
  'data augmentation', 'protein structure', 'drug discovery', 'single cell', 'remote sensing',
  'autonomous driving', 'carbon emission', 'digital twin', 'molecular property prediction',
  'state-of-the-art', 'out-of-distribution', 'domain adaptation', 'multi-task learning',
  'deep learning', 'machine learning', 'neural network', 'attention mechanism', 'diffusion model'
];

// 英文单词到规范形的轻量词形映射（避免检索式出现动词原形）
const WORD_FORMS = {
  detect: 'detection', detecting: 'detection', classify: 'classification',
  classifying: 'classification', denoise: 'denoising', denoising: 'denoising',
  segment: 'segmentation', predict: 'prediction', forecasting: 'forecasting',
  generate: 'generation', recognizing: 'recognition', translate: 'machine translation',
  retrieval: 'retrieval', retrieve: 'retrieval', recommend: 'recommendation',
  segmenting: 'segmentation', estimating: 'estimation', calibration: 'calibration'
};

// 中文预处理：多字虚词/程度副词整词剔除（先长后短，避免残留）
const ZH_NOISE_PHRASES = [
  '极度', '非常', '特别', '严重', '比较', '一些', '如何', '怎么', '我的', '我们',
  '基于', '利用', '使用', '通过', '采用', '提出', '一种', '一个', '以及', '并且',
  '但是', '因为', '所以', '如果', '可以', '进行', '为了', '从而', '进而', '更加',
  '尤其', '例如', '比如', '而是', '而且', '然后', '于是', '对于', '关于', '就是',
  '还是', '或者', '请问', '谢谢', '帮我', '我想', '想要', '希望', '能否', '是否',
  '这个', '那个', '什么', '怎样', '怎么办', '如此', '这样', '那样', '一直', '总是',
  '减少', '降低', '提高', '提升', '改善', '解决', '实现', '完成', '做到', '存在'
].sort((a, b) => b.length - a.length);

// 扫描时逐字跳过的单字虚词（仅在「该位置无任何词典命中」时跳过，绝不误伤术语内部字符）
const ZH_NOISE_SINGLE = new Set([
  '的', '了', '和', '与', '及', '在', '是', '我', '有', '对', '上', '下', '中', '个',
  '做', '能', '会', '这', '那', '就', '都', '把', '被', '给', '让', '使', '等', '要',
  '很', '吧', '呢', '啊', '时', '地', '得', '而', '或', '于', '之', '也', '还', '又',
  '但', '从', '向', '为', '以', '更', '由', '其', '该', '各', '每', '些', '点', '用',
  '被', '将', '却', '并', '因', '所', '若', '即', '虽', '然', '且', '故', '则'
]);

const isCJK = (ch) => /[\u4e00-\u9fff]/.test(ch);

function stripPhraseNoise(s) {
  let out = s;
  for (const w of ZH_NOISE_PHRASES) {
    if (out.includes(w)) out = out.split(w).join('');
  }
  return out;
}

const TERM_MAP = new Map(TERMS);
const SORTED_ZH = TERMS.map(([zh]) => zh).sort((a, b) => b.length - a.length);

// 在任意片段里做「最长匹配」抽取，返回命中术语列表 + 未命中的连续中文片段
function matchInRun(run) {
  const hits = [];
  const rest = [];
  let pending = '';
  let i = 0;
  while (i < run.length) {
    if (!isCJK(run[i])) {
      if (pending) { rest.push(pending); pending = ''; }
      i += 1;
      continue;
    }
    let matched = null;
    for (const term of SORTED_ZH) {
      if (run.startsWith(term, i)) { matched = term; break; }
    }
    if (matched) {
      if (pending) { rest.push(pending); pending = ''; }
      hits.push(matched);
      i += matched.length;
    } else if (ZH_NOISE_SINGLE.has(run[i])) {
      if (pending) { rest.push(pending); pending = ''; }
      i += 1;
    } else {
      pending += run[i];
      i += 1;
    }
  }
  if (pending) rest.push(pending);
  return { hits, rest };
}

// 2–4 字滑窗子串查词典：对仍未识别的中文片段，尝试挖出其中藏着的较短术语
function slidingWindowMine(run) {
  const found = [];
  for (const term of SORTED_ZH) {
    if (term.length >= 2 && term.length <= 4 && run.includes(term)) found.push(term);
  }
  return found;
}

// 中文最长匹配切分：命中词典的词 + 未命中的连续中文字符（供兜底提示）
export function segmentChinese(text) {
  const cleaned = stripPhraseNoise(String(text || ''));
  const hits = [];
  const restRuns = [];
  const push = (h) => { if (!hits.includes(h)) hits.push(h); };

  // 先按非中文切段，再逐段最长匹配（matchInRun 已处理单字虚词跳过）
  const segs = cleaned.split(/[^一-鿿]+/g);
  for (const seg of segs) {
    if (!seg) continue;
    const r = matchInRun(seg);
    r.hits.forEach(push);
    for (const leftover of r.rest) {
      // 滑窗补挖：leftover 里若藏着 2–4 字术语，补进命中，并从片段中剔除
      const mined = slidingWindowMine(leftover).filter((t) => !hits.includes(t));
      if (mined.length) {
        mined.forEach(push);
        let shrunk = leftover;
        for (const t of mined) shrunk = shrunk.split(t).join('');
        if (shrunk.length >= 2) restRuns.push(shrunk);
      } else if (leftover.length >= 2) {
        restRuns.push(leftover);
      }
    }
  }
  return { hits, rest: restRuns };
}

// 从原文（含中英混排）里抽取英文/数字检索词：短语优先成词，其余按 token 处理
function extractEnglish(text) {
  const s = String(text || '');
  const lower = s.toLowerCase();
  const out = [];
  const push = (t) => { if (t && !out.includes(t)) out.push(t); };

  const phraseList = [];
  for (const p of EN_PHRASES) phraseList.push(p);
  for (const [, en] of TERMS) if (en && /\s/.test(en) && !phraseList.includes(en)) phraseList.push(en);
  phraseList.sort((a, b) => b.length - a.length);

  const taken = new Array(s.length).fill(false);
  const isWordChar = (c) => c && /[\p{L}\p{N}]/u.test(c);
  for (const phrase of phraseList) {
    const needle = phrase.toLowerCase();
    if (needle.includes(' ') === false) continue; // 只处理多词短语
    let idx = lower.indexOf(needle, 0);
    while (idx !== -1) {
      if (taken[idx]) { idx = lower.indexOf(needle, idx + needle.length); continue; }
      const before = idx === 0 ? ' ' : s[idx - 1];
      const after = idx + needle.length >= s.length ? ' ' : s[idx + needle.length];
      if (!isWordChar(before) && !isWordChar(after)) {
        for (let k = idx; k < idx + needle.length; k += 1) taken[k] = true;
        push(phrase);
      }
      idx = lower.indexOf(needle, idx + needle.length);
    }
  }

  const latinRe = /[A-Za-z][A-Za-z0-9+.\-]*|\d+[A-Za-z][A-Za-z0-9]*|\d+/g;
  let m;
  while ((m = latinRe.exec(s))) {
    const start = m.index;
    const token = m[0];
    if (taken[start]) continue;
    for (let k = start; k < start + token.length; k += 1) taken[k] = true;
    if (/^\d+$/.test(token)) continue;
    const low = token.toLowerCase();
    if (STOPWORDS.has(low)) continue;
    const isAcronym = /^[A-Z]{2,7}$/.test(token);
    const hasDigit = /\d/.test(token);
    let term;
    if (isAcronym || hasDigit) term = token; // CT / MRI / BERT / LLM / GNN / 3D 原样保留
    else term = WORD_FORMS[low] || low;
    if (term.length >= 2) push(term);
  }
  return out;
}

// 输入 → 英文关键词（保序去重），并记录未命中词典的中文片段
export function keywords(text) {
  const { hits, rest } = segmentChinese(text);
  const out = [];
  const push = (t) => { if (t && !out.includes(t)) out.push(t); };
  for (const zh of hits) push(TERM_MAP.get(zh));
  for (const w of extractEnglish(text)) push(w);
  const unmapped = rest.map(stripPhraseNoise).map((r) => r.replace(/\s+/g, '')).filter((r) => r.length >= 2);
  return { terms: out.slice(0, 8), unmapped };
}

function uniq(list) {
  return Array.from(new Set(list.filter(Boolean)));
}

// 规则法查询扩展：3–5 条英文检索式
export function buildQueries(text) {
  const { terms } = keywords(text);
  if (!terms.length) {
    const raw = String(text || '').trim().replace(/\s+/g, ' ');
    if (!raw || /[\u4e00-\u9fff]/.test(raw)) return [];
    return [raw];
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
  const lower = String(text || '').toLowerCase();
  for (const d of DATASETS) {
    if (lower.includes(d.toLowerCase()) && !found.includes(d)) found.push(d);
  }
  return found;
}

export function matchKnownMetrics(text) {
  const found = [];
  const lower = String(text || '').toLowerCase();
  for (const m of METRICS) {
    if (lower.includes(m.toLowerCase()) && !found.includes(m)) found.push(m);
  }
  return found;
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
  'mean Average Precision', 'energy score'
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
  // 结论句线索：需与「本文自身」线索同现才算论文报告的效果（单独命中只可能是背景句）
  result: [
    /\b(?:outperform[s|ed]?|surpass\w*|beat[s]?|exceed\w*)\b/i,
    /\b(?:improv\w*|boost\w*|increase[sd]?|enhanc\w*|gain\w*|reduc\w*|decreas\w*|achiev\w*|obtain\w*|yield\w*)\b/i,
    /\b(?:show|shows|showed|demonstrat\w*|reveal\w*|confirm\w*|validat\w*|verif\w*)\b/i,
    /\b(?:experiments?\b|experimentally|evaluat\w*|benchmarked?)\b/i,
    /\bstate[- ]of[- ]the[- ]art\b/i,
    /\bresults?\s+(?:show|demonstrate|indicate|suggest|reveal)\b/i,
    /\b\d+(?:\.\d+)?\s?(?:%|percent|points?|p\.p\.|x|times)\b/i
  ],
  // 局限线索：同样要求描述本文自身
  limitation: [
    /\blimitation\w*/i,
    /\bfail\w*|\bfailure/i,
    /\bcannot\b|\bcan not\b/i,
    /\bremains?\b|\bstill\b/i,
    /\bhowever\b/i,
    /\bonly\b/i,
    /\b(?:struggl\w*|suffer\w*|drawback\w*|shortcoming\w*|caveat\w*|trade-?off|insufficient|limited|restricted|hard to|difficult to|may not|generaliz\w* (?:to|across))\b/i,
    /\bfuture (?:work|research|direction)/i
  ],
  datasetPrep: /\b(?:dataset|datasets|benchmark|benchmarks|corpus|corpora|train(?:ing)? set|test set|validation set|clinical notes|cohort)\b/i
};

// 「本文自身」线索：效果/局限句必须落在这些表述上，否则多半是背景句或他人工作
export const OWN_VOICE = new RegExp([
  '\\b(?:we|our|ours)\\b',
  '\\bthis (?:paper|study|work|project|thesis|article|report)\\b',
  '\\b(?:this|these|such)\\s+(?:gain|gains|improvement|improvements|result|results|idea|strategy|scheme|pipeline|loss|method|approach|model|finding|findings|observation|solution)\\b',
  '\\bthe (?:proposed|method|approach|framework|model|system|technique|pipeline|network|algorithm)\\b',
  '\\bour (?:method|approach|framework|model|system|technique|pipeline|result|results|finding|findings)\\b',
  '\\b(?:proposed|presented|introduced|developed|designed) (?:method|approach|framework|model|technique|pipeline|system)\\b',
  '\\b(?:is|are|was|were) (?:proposed|presented|introduced|developed|designed)\\b'
].join('|'), 'i');

// 句首背景标记：以这些词开头的句子通常在讲领域现状而非本文结果
export const BACKGROUND_VOICE = /^(?:having|prior|previous|earlier|recent|recently|although|while|despite|numerous|many|several|over the (?:past|last)|in the past|nowadays)\b/i;

// 结构性自身句：以「实验/结果/本文方法」开头的句子即使没有 we/our 也属于本文
export const OWN_STRUCTURAL_VOICE = new RegExp([
  '^(?:experimental\\w*|experiments?)\\s+(?:results?|evaluation|evaluations|study|analysis|comparison|validation|conducted|on\\b|and\\b|show\\b|were\\b|are\\b)',
  '^results?\\s+(?:of\\s+our|show|demonstrate|indicate|suggest|reveal|confirm)',
  '^findings?\\s+(?:show|suggest|indicate)',
  '^(?:the|our|this)\\s+(?:proposed|proposed\\s+)?(?:method|loss|approach|framework|model|algorithm|solution|implementation|pipeline|system|evaluation)',
  '^we\\b'
].join('|'), 'i');

// 方法关键词 → 中文标签词表：聚类命名与簇概述都靠它（words 忽略大小写、按词边界匹配；
// caps 只在原文里区分大小写匹配，避免 rag 命中 aggregate/paragraph、gan 命中 Gan 之类）
export const METHOD_LABELS = [
  { label: '损失重加权与代价敏感', words: ['reweighting', 're-weighting', 're-weight', 'weighted loss', 'class weight', 'class weights', 'class-weighted', 'cost-sensitive', 'cost sensitive', 'focal loss', 'class-balanced loss', 'balanced softmax', 'balanced cross entropy', 'weighted cross entropy', 'label smoothing', 'asymmetric loss', 'rebalanced loss', 'class-aware loss'] },
  { label: '重采样', words: ['oversampling', 'over-sampling', 'undersampling', 'under-sampling', 'resampling', 'smote', 'adasyn', 'random oversampling', 'minority oversampling', 'replacement learning'] },
  { label: '采样与批次策略', words: ['negative sampling', 'graph sampling', 'importance sampling', 'sub-sampling', 'subsampling', 'stratified sampling', 'episode sampling', 'batch construction', 'class-balanced batch', 'balanced sampling', 'sampling strategy'] },
  { label: '数据增强与合成', words: ['data augmentation', 'augmentation', 'augmenting', 'augment', 'synthetic data', 'synthetic sample', 'synthetic image', 'synthetic text', 'data synthesis', 'image synthesis', 'generative adversarial', 'generative model', 'diffusion', 'mixup', 'cutmix', 'cutpaste', 'back-translation', 'style transfer augmentation'], caps: ['GAN', 'GANs'] },
  { label: '阈值与决策调整', words: ['threshold', 'thresholding', 'post-processing', 'decision threshold', 'cutoff', 'rejection option', 'prediction rule'] },
  { label: '置信度校准', words: ['calibration', 'calibrated', 'calibrate', 'temperature scaling', 'expected calibration error', 'probability calibration', 'overconfidence', 'confidence estimation'] },
  { label: '不确定性建模', words: ['uncertainty', 'evidential', 'bayesian', 'probabilistic model', 'variance estimation', 'prediction interval', 'aleatoric', 'epistemic'] },
  { label: '对比学习', words: ['contrastive', 'supervised contrastive', 'simclr', 'momentum contrast', 'contrastive loss', 'instance discrimination'] },
  { label: '原型与类中心学习', words: ['prototype', 'prototypical', 'class center', 'class prototype', 'centroid', 'prototype network', 'anchor'] },
  { label: '度量学习', words: ['metric learning', 'siamese', 'triplet loss', 'relation network', 'embedding similarity', 'pairwise distance'] },
  { label: '元学习', words: ['meta-learning', 'meta learning', 'meta-optimization', 'maml', 'episode-based', 'support set', 'query set', 'meta network', 'meta-loss'], caps: ['MAML'] },
  { label: '小样本与零样本设定', words: ['few-shot', 'zero-shot', 'one-shot', 'n-shot', 'k-shot', 'low-data', 'low resource', 'low-resource', 'limited labeled data', 'small sample', 'data-scarce', 'label scarcity'] },
  { label: '迁移与预训练', words: ['transfer learning', 'pretraining', 'pre-training', 'pretrained', 'pre-trained', 'fine-tuning', 'fine-tune', 'fine-tuned', 'foundation model', 'domain transfer', 'backbone pretraining'] },
  { label: '参数高效微调', words: ['parameter-efficient', 'low-rank adaptation', 'adapter', 'adapters', 'prefix tuning', 'spatial adapter', 'lightweight tuning'], caps: ['LoRA'] },
  { label: '域适应与域泛化', words: ['domain adaptation', 'domain generalization', 'distribution shift', 'out-of-distribution', 'covariate shift', 'domain gap'] },
  { label: '检索增强', words: ['retrieval-augmented', 'retrieval augmented', 'retrieval-augmented generation', 'retrieval-grounded'], caps: ['RAG'] },
  { label: '检索与重排序', words: ['retriever', 'dense retrieval', 'document retrieval', 'passage retrieval', 'reranking', 're-ranking', 'candidate ranking', 'bm25', 'vector search', 'top-k retrieval'] },
  { label: '提示与指令', words: ['prompt', 'prompts', 'prompting', 'prompt-based', 'prompt engineering', 'prompt tuning', 'prompt learning', 'instruction tuning', 'in-context learning', 'soft prompt'] },
  { label: '推理链与自我改进', words: ['chain-of-thought', 'chain of thought', 'reasoning', 'rationale', 'step-by-step', 'self-consistency', 'reflection', 'critique', 'self-verification', 'verification'], caps: ['CoT'] },
  { label: '知识图谱', words: ['knowledge graph', 'knowledge graphs', 'knowledge base', 'ontology', 'knowledge-enhanced', 'triples'] },
  { label: '知识蒸馏', words: ['knowledge distillation', 'distillation', 'teacher-student', 'teacher student', 'student network', 'soft labels'] },
  { label: '联邦学习', words: ['federated learning', 'federated', 'secure aggregation', 'split learning', 'client updates'] },
  { label: '隐私保护', words: ['differential privacy', 'privacy-preserving', 'privacy', 'encryption', 'federated aggregation'] },
  { label: '对抗与鲁棒性', words: ['adversarial', 'attack', 'poisoning', 'jailbreak', 'robustness', 'perturbation', 'backdoor', 'defense'] },
  { label: '主动学习与标注', words: ['active learning', 'query strategy', 'annotation budget', 'human-in-the-loop', 'expert annotation', 'labeling cost'] },
  { label: '弱监督与标签噪声', words: ['noisy label', 'noisy labels', 'label noise', 'weakly supervised', 'multi-instance', 'partial labels', 'pseudo-label', 'pseudo label', 'co-training'] },
  { label: '半监督学习', words: ['semi-supervised', 'unlabeled data', 'without labels', 'label-efficient'] },
  { label: '自监督学习', words: ['self-supervised', 'self-supervision', 'pretext task', 'masked image modeling', 'masked autoencoder'], caps: ['MAE'] },
  { label: '注意力与Transformer', words: ['attention', 'transformer', 'self-attention', 'multi-head', 'vision transformer', 'attention mechanism', 'attention map', 'encoder-decoder'] },
  { label: '图神经网络', words: ['graph neural network', 'graph neural networks', 'graph convolution', 'graph attention', 'message passing', 'graph network', 'graph encoder', 'gcn', 'graph embedding'], caps: ['GNN', 'GNNs', 'GCN'] },
  { label: '卷积网络', words: ['convolutional', 'cnn', 'resnet', 'densenet', 'vgg', 'unet', 'convnet', 'convolution'] },
  { label: '循环与时序网络', words: ['lstm', 'bilstm', 'gru', 'recurrent neural', 'temporal convolution', 'seq2seq'] },
  { label: '集成与多专家', words: ['ensemble', 'boosting', 'xgboost', 'random forest', 'bagging', 'voting', 'multi-expert', 'mixture of experts'] },
  { label: '多任务学习', words: ['multi-task', 'multitask', 'joint training', 'jointly learned', 'task-sharing'] },
  { label: '强化学习与偏好优化', words: ['reinforcement learning', 'reward model', 'policy optimization', 'preference optimization', 'direct preference', 'human feedback', 'q-learning'], caps: ['RLHF', 'DPO'] },
  { label: '多模态与视觉语言', words: ['multimodal', 'multi-modal', 'vision-language', 'cross-modal', 'image-text', 'visual question answering', 'clip'], caps: ['CLIP'] },
  { label: '大模型问答与应用', words: ['large language model', 'language model', 'chatbot', 'question answering', 'clinical decision support', 'gpt', 'conversational'], caps: ['LLM', 'LLMs', 'GPT'] },
  { label: '长上下文与记忆', words: ['long context', 'long-context', 'context window', 'memory bank', 'retrieval memory', 'context compression'] },
  { label: '幻觉与事实性', words: ['hallucination', 'hallucinations', 'factuality', 'faithfulness', 'grounded generation', 'fabricat'] },
  { label: '可解释与归因', words: ['interpretability', 'explainability', 'explainable', 'saliency', 'feature importance', 'probing', 'interpretability analysis', 'shap', 'attribution', 'visualization of attention'] },
  { label: '效率与压缩', words: ['quantization', 'pruning', 'model compression', 'lightweight', 'efficient inference', 'latency', 'memory footprint', 'edge deployment', 'on-device', 'gpu memory'] },
  { label: '增量与持续学习', words: ['continual learning', 'class-incremental', 'class incremental', 'incremental learning', 'catastrophic forgetting', 'lifelong learning'] },
  { label: '层次与多阶段建模', words: ['hierarchical', 'multi-stage', 'two-stage', 'coarse-to-fine', 'cascade', 'multi-level'] },
  { label: '因果与结构建模', words: ['causal', 'counterfactual', 'structural equation', 'causal graph', 'intervention'] },
  { label: '分割任务', words: ['segmentation', 'instance segmentation', 'panoptic', 'mask prediction'] },
  { label: '检测任务', words: ['object detection', 'anomaly detection', 'lesion detection', 'node detection', 'detection task'] },
  { label: '分类器与判别建模', words: ['classifier', 'logit adjustment', 'support vector', 'svm', 'decision tree', 'discriminative model'] },
  { label: '表示学习与嵌入', words: ['representation learning', 'embedding', 'embeddings', 'latent space', 'feature extraction', 'feature representation', 'encoder'] },
  { label: '去噪与预处理', words: ['denoising', 'denoise', 'preprocessing', 'pre-processing', 'data cleaning', 'normalization', 'noise reduction'] },
  { label: '综述与基准', words: ['survey', 'systematic review', 'literature review', 'review of', 'benchmark', 'benchmarking', 'evaluation study', 'comparative study', 'taxonomy', 'dataset and evaluation'] },
  { label: '医学影像与临床', words: ['medical imaging', 'medical image', 'clinical', 'radiology', 'lesion', 'diagnosis', 'pathology', 'x-ray', 'ct image', 'mri', 'histopathology'] },
  { label: '分子与药物建模', words: ['molecular', 'molecule', 'drug discovery', 'drug', 'protein', 'chemical', 'smiles', 'molecular graph', 'compound'] },
  { label: '遥感与地理', words: ['remote sensing', 'land cover', 'satellite', 'geospatial', 'gis'] },
  { label: '语音与音频', words: ['speech recognition', 'speech', 'audio', 'speaker', 'asr'] },
  { label: '文本分类与情感', words: ['text classification', 'sentiment', 'topic model', 'document classification', 'dialect', 'language identification'] },
  { label: '推荐与用户建模', words: ['recommendation', 'recommender', 'user behavior', 'click-through'] },
  { label: '时序与预测任务', words: ['time series', 'time-series', 'forecasting', 'spatio-temporal', 'prediction horizon'] },
  { label: '教育与测评', words: ['essay scoring', 'automated grading', 'student performance', 'education', 'learning analytics'] },
  { label: '机器翻译与生成摘要', words: ['machine translation', 'translation', 'summarization', 'text generation', 'abstractive'] }
];

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 词边界计数：多词短语按子串、单词按 \b 边界；caseSensitive 用于 RAG/GAN/LoRA 这类缩写
function countWord(haystack, needle, caseSensitive) {
  if (!needle) return 0;
  const pre = /[\w-]/.test(needle[0]) ? '\\b' : '';
  const post = /[\w-]/.test(needle[needle.length - 1]) ? '\\b' : '';
  const re = new RegExp(`${pre}${escapeRe(needle)}${post}`, caseSensitive ? 'g' : 'gi');
  let n = 0;
  while (re.exec(haystack)) {
    n += 1;
    if (re.lastIndex === re.index) re.lastIndex += 1;
  }
  return n;
}

// 文本 → 命中的方法标签（按命中次数降序），附带最多 3 个命中的原始关键词便于展示
export function matchMethodLabels(text) {
  const s = String(text || '');
  const out = [];
  for (const e of METHOD_LABELS) {
    let hits = 0;
    const matched = [];
    for (const w of e.words) {
      const c = countWord(s, w, false);
      if (c) { hits += c; matched.push(w); }
    }
    for (const a of e.caps || []) {
      const c = countWord(s, a, true);
      if (c) { hits += c; matched.push(a); }
    }
    if (hits) out.push({ label: e.label, hits, matched });
  }
  return out.sort((a, b) => b.hits - a.hits || a.label.localeCompare(b.label, 'zh-Hans'));
}
