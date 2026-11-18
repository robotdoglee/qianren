cd /workspace/projects-work/qianren/data-gen
python3 gather.py demo-rag-med "retrieval-augmented generation medical question answering" "retrieval augmented large language model clinical hallucination" "medical LLM hallucination mitigation knowledge graph retrieval" 
python3 gather.py demo-gnn-fewshot "few-shot molecular property prediction graph neural network" "meta-learning molecular property prediction low data" "graph neural network molecular property prediction limited labeled data pretraining"
python3 gather.py demo-imbalance "class imbalance medical image classification" "long-tailed medical image classification minority class recall" "imbalanced medical imaging deep learning loss reweighting oversampling"
echo DONE
