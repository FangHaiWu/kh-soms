import { PartialType } from '@nestjs/mapped-types';
import { CreateGroupDto } from './create-group.dto';

export class UpdateGroupDto extends PartialType(CreateGroupDto) {
  // PartialType tu dong tao ra cac truong optional tu CreateGroupDto
}
