using { test.logcontrol as db } from '../db/schema';

service TestService {
  entity Foos as projection on db.Foo;
}
