from django.contrib.auth.models import User
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.permissions import IsAuthenticated

from usuarios.models import Motorista

class VerificarCPFView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        cpf = request.data.get('cpf')

        if not cpf or not cpf.isdigit() or len(cpf) != 11:
            return Response({"status": "CPF_INVALIDO"}, status=400)

        try:
            motorista = Motorista.objects.get(cpf=cpf)
        except Motorista.DoesNotExist:
            return Response({"status": "NAO_ENCONTRADO"})

        if motorista.user is not None:
            return Response({"status": "USUARIO_EXISTENTE"})

        return Response({
            "status": "NOVO_USUARIO",
            "nome": motorista.nome_completo
        })


class PrimeiroAcessoView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        cpf = request.data.get('cpf')
        senha = request.data.get('senha')
        confirmar = request.data.get('confirmar_senha')

        if senha != confirmar:
            return Response(
                {"erro": "Senhas não conferem"},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            motorista = Motorista.objects.get(cpf=cpf)
        except Motorista.DoesNotExist:
            return Response({"erro": "Motorista não encontrado"}, status=404)

        if motorista.user:
            return Response({"erro": "Usuário já existe"}, status=400)

        user = User.objects.create_user(
            username=cpf,
            password=senha,
            first_name=motorista.nome_completo.split()[0]
        )

        motorista.user = user
        motorista.save()

        refresh = RefreshToken.for_user(user)

        return Response({
            "access": str(refresh.access_token),
            "refresh": str(refresh)
        })


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user

        try:
            motorista = user.motorista_perfil
        except Motorista.DoesNotExist:
            return Response(
                {"detail": "Motorista não vinculado ao usuário"},
                status=404
            )

        return Response({
            "id": motorista.id,
            "nome": motorista.nome_completo,
            "cpf": motorista.cpf,
            "tipo": motorista.tipo_usuario
        })