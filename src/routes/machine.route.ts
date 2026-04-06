import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { logAction } from '../middleware/logging';
import {
    getMachinesForUser,
    getMachineById,
    updateMachine,
    deregisterMachine,
    createEnrollmentCode,
    getEnrollmentCodes,
    revokeEnrollmentCode,
} from '../controllers/machine.controller';

const machineRouter = Router();

machineRouter.use(authenticate);
machineRouter.use(logAction);

// Enrollment code routes (before /:machineId to avoid conflicts)
machineRouter.get('/enrollment-codes', getEnrollmentCodes);
machineRouter.post('/enrollment-codes', createEnrollmentCode);
machineRouter.delete('/enrollment-codes/:codeId', revokeEnrollmentCode);

// Machine routes
machineRouter.get('/', getMachinesForUser);
machineRouter.get('/:machineId', getMachineById);
machineRouter.patch('/:machineId', updateMachine);
machineRouter.delete('/:machineId', deregisterMachine);

export default machineRouter;
