# Versión reducida de attend.py de Music-Source-Separation-Training (ZFTurbo), licencia MIT
# (ver LICENSE-MSST). Solo para separar: no consulta la gráfica al crear el modelo (en ZeroGPU
# la gráfica de verdad solo existe dentro de @spaces.GPU) y deja que PyTorch elija el núcleo
# de atención más rápido. No tiene pesos, así que el modelo carga igual.

import torch.nn.functional as F
from torch import nn, einsum


class Attend(nn.Module):
    def __init__(self, dropout=0., flash=False, scale=None):
        super().__init__()
        self.scale = scale
        self.dropout = dropout
        self.attn_dropout = nn.Dropout(dropout)
        self.flash = flash

    def forward(self, q, k, v):
        if self.flash:
            if self.scale is not None:
                q = q * (self.scale / q.shape[-1] ** -0.5)
            return F.scaled_dot_product_attention(q, k, v, dropout_p=self.dropout if self.training else 0.)

        scale = self.scale if self.scale is not None else q.shape[-1] ** -0.5
        sim = einsum("b h i d, b h j d -> b h i j", q, k) * scale
        attn = self.attn_dropout(sim.softmax(dim=-1))
        return einsum("b h i j, b h j d -> b h i d", attn, v)
