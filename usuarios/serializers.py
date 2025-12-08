# usuarios/serializers.py

from rest_framework import serializers
from .models import Motorista
from django.contrib.auth.models import User

## 1. Serializer para entrada de dados de Login
class MotoristaLoginSerializer(serializers.Serializer):
    """
    Define os campos esperados na requisição POST de login.
    O 'username' será mapeado para o CPF no frontend.
    """
    # Recebe o CPF (que será o 'username' do User)
    username = serializers.CharField(max_length=11, label="CPF")
    # Recebe a senha (write_only garante que a senha não seja retornada)
    password = serializers.CharField(write_only=True)

    # Nota: A validação e a geração do token são feitas pelas views do JWT.


## 2. Serializer para a saída dos dados do Perfil do Motorista
class MotoristaPerfilSerializer(serializers.ModelSerializer):
    """
    Retorna os dados do motorista logado (vinculado ao token JWT).
    """
    # Mapeia o campo username do modelo User para o CPF, garantindo que seja read-only
    cpf = serializers.CharField(source='cpf', read_only=True) 
    
    # O campo 'username' da tabela User (que contém o CPF)
    user_username = serializers.CharField(source='user.username', read_only=True, label="CPF do Usuário")

    class Meta:
        model = Motorista
        fields = (
            'cpf', 
            'nome_completo', 
            'cnh_numero', 
            'tipo_usuario', 
            'foto_perfil',
            'user_username',
        )
        read_only_fields = fields