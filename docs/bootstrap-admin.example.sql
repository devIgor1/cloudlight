-- Edite antes de executar. A migração de produção nunca cria contas padrão.
INSERT INTO users(id,email,name,role,created_at)
VALUES(lower(hex(randomblob(16))),'SEU_EMAIL_VALIDADO','Seu nome','admin',unixepoch()*1000);
