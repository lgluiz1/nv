# usuarios/views.py

from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView
from usuarios.serializers import MotoristaPerfilSerializer

# View customizada para obter o token (opcional, se precisarmos de lógica extra)
# Por enquanto, usaremos a TokenObtainPairView diretamente no urls.py
# class CustomTokenObtainPairView(TokenObtainPairView):
#     pass

class PerfilMotoristaView(generics.RetrieveAPIView):
    # Requer que o JWT token seja válido no cabeçalho Authorization
    permission_classes = [IsAuthenticated]
    serializer_class = MotoristaPerfilSerializer

    def get_object(self):
        """
        Retorna o perfil Motorista associado ao usuário autenticado.
        """
        try:
            # Acessa o perfil Motorista através do related_name 'motorista_perfil'
            return self.request.user.motorista_perfil
        except AttributeError:
            raise generics.exceptions.NotFound("Perfil de motorista não encontrado.")

    def retrieve(self, request, *args, **kwargs):
        # Retorna os dados do motorista. O CPF já estará no serializer.
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        
        return Response(serializer.data, status=status.HTTP_200_OK)