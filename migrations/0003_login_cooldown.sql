CREATE TRIGGER challenge_cooldown BEFORE INSERT ON challenges
WHEN EXISTS(SELECT 1 FROM challenges WHERE user_id=NEW.user_id AND created_at>NEW.created_at-60000)
BEGIN SELECT RAISE(ABORT, 'LOGIN_COOLDOWN'); END;
